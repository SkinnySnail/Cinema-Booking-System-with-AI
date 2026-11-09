import copy
from pathlib import Path
import subprocess
import sys

import pytest
from fastapi.testclient import TestClient

from cinema_tuning.cli import CONFIG, demo
from cinema_tuning.common import ROOT, read_json, write_json
from cinema_tuning.data import classification_rows, load_prepared, prepare, recommendation_rows, timestamp
from cinema_tuning.seed import write_csv
from cinema_tuning.training import bundle, evaluate, ranking_metrics, tune
from engine import forecast, recommend
from model_bundle import ModelBundle


@pytest.fixture(scope="module")
def workflow(tmp_path_factory):
    directory = tmp_path_factory.mktemp("pipeline") / "demo"
    summary = demo(directory, read_json(CONFIG))
    return directory, summary


def test_full_workflow_produces_all_four_evaluated_tasks(workflow):
    root, result = workflow
    assert set(result["evaluations"]) == {"sentiment", "intent", "forecast", "recommendation"}
    loaded = ModelBundle(root / "bundle")
    assert set(loaded.models) == {"sentiment", "intent", "forecast:1", "recommendation"}
    for task, evaluation in result["evaluations"].items():
        assert evaluation["split"] == "test"
        assert evaluation["provenance"] != "real"
        assert read_json(root / "runs" / task / "run.json")["trials"]
    metrics = result["evaluations"]["recommendation"]["metrics"]
    assert 0 <= metrics["precision_at_k"] <= 1 and 0 <= metrics["ndcg_at_k"] <= 1


@pytest.mark.parametrize("task", ["sentiment", "intent"])
def test_grouped_text_splits_do_not_overlap(workflow, task):
    root, _ = workflow
    data, manifest = load_prepared(root / "prepared" / task)
    groups = [{row["group"] for row in data["splits"][name]} for name in ["train", "validation", "test"]]
    assert not groups[0] & groups[1] and not groups[0] & groups[2] and not groups[1] & groups[2]
    assert manifest["provenance"] == "bootstrap"


@pytest.mark.parametrize("task", ["forecast", "recommendation"])
def test_temporal_split_has_strict_time_boundaries(workflow, task):
    data, _ = load_prepared(workflow[0] / "prepared" / task)
    train, validation, test = [data["splits"][name] for name in ["train", "validation", "test"]]
    assert max(r["timestamp"] for r in train) < min(r["timestamp"] for r in validation)
    assert max(r["timestamp"] for r in validation) < min(r["timestamp"] for r in test)


def test_bad_labels_and_contradictory_duplicate_text_are_rejected(tmp_path):
    path = tmp_path / "reviews.csv"
    write_csv(path, ["text", "label"], [{"text": "same review", "label": ""}])
    with pytest.raises(ValueError, match="label"):
        classification_rows(path, "sentiment")
    write_csv(path, ["text", "label"], [{"text": "same review", "label": "positive"}, {"text": "same review", "label": "negative"}])
    with pytest.raises(ValueError, match="Conflicting"):
        classification_rows(path, "sentiment")


def test_duplicate_variants_are_deduplicated(tmp_path):
    path = tmp_path / "reviews.csv"
    write_csv(path, ["text", "label"], [
        {"text": "Phim rất hay", "label": "positive"}, {"text": "phim rat hay", "label": "positive"},
        {"text": "bad movie", "label": "negative"}, {"text": "average movie", "label": "neutral"},
    ])
    assert len(classification_rows(path, "sentiment")) == 3


def test_changed_prepared_data_are_rejected(workflow, tmp_path):
    source = workflow[0] / "prepared/sentiment"
    write_json(tmp_path / "manifest.json", read_json(source / "manifest.json"))
    data = read_json(source / "data.json")
    data["splits"]["train"][0]["label"] = "tampered"
    write_json(tmp_path / "data.json", data)
    with pytest.raises(ValueError, match="changed"):
        load_prepared(tmp_path)


def test_forecast_rejects_invalid_occupancy_and_requires_scope(tmp_path):
    path = tmp_path / "shows.csv"
    fields = ["showtime_id", "timestamp", "cinema_id", "movie_id", "capacity", "sold"]
    write_csv(path, fields, [{"showtime_id": 1, "timestamp": "2025-01-01T12:00:00+07:00",
                              "cinema_id": 1, "movie_id": 1, "capacity": 10, "sold": 11}])
    with pytest.raises(ValueError, match="cinema-id"):
        prepare("forecast", path, tmp_path / "no-scope")
    with pytest.raises(ValueError, match="occupancy"):
        prepare("forecast", path, tmp_path / "invalid", cinema_id=1)
    assert not (tmp_path / "invalid").exists()


def test_mismatched_evaluation_dataset_is_rejected(workflow, tmp_path):
    # A separately prepared dataset with valid hashes still cannot evaluate another run.
    from cinema_tuning.common import digest_records
    data, manifest = load_prepared(workflow[0] / "prepared/sentiment")
    data["splits"]["test"][0]["text"] += " changed"
    manifest["data_digest"] = digest_records(data)
    write_json(tmp_path / "manifest.json", manifest)
    write_json(tmp_path / "data.json", data)
    with pytest.raises(ValueError, match="differs"):
        evaluate(workflow[0] / "runs/sentiment", tmp_path)


def test_tuning_never_reads_test_observations(workflow, tmp_path, monkeypatch):
    from cinema_tuning import training
    data, manifest = load_prepared(workflow[0] / "prepared/sentiment")

    class ForbiddenTest:
        def __iter__(self):
            raise AssertionError("Hyperparameter selection read the test set")
        def __len__(self):
            raise AssertionError("Hyperparameter selection read the test set")

    data["splits"]["test"] = ForbiddenTest()
    monkeypatch.setattr(training, "load_prepared", lambda _: (data, manifest))
    result = tune("unused", tmp_path / "run", read_json(CONFIG))
    assert "validation" in result and "test" not in result


def test_evaluation_cannot_be_silently_overwritten(workflow):
    with pytest.raises(ValueError, match="already evaluated"):
        evaluate(workflow[0] / "runs/sentiment", workflow[0] / "prepared/sentiment")


def test_bundle_requires_explicit_demo_and_failed_gate_overrides(workflow, tmp_path):
    runs = [workflow[0] / "runs/sentiment"]
    with pytest.raises(ValueError, match="allow-demo"):
        bundle(runs, tmp_path / "denied")
    # Seed data have not validated the required confidence/coverage on real reviews.
    evaluation = read_json(runs[0] / "evaluation.json")
    assert not evaluation["quality_gate_passed"]
    with pytest.raises(ValueError, match="Quality gate"):
        bundle(runs, tmp_path / "also-denied", allow_demo=True)
    assert bundle(runs, tmp_path / "explicit", allow_demo=True, allow_below_threshold=True)["overrides"]["allow_demo"]


def test_model_bundle_rejects_corruption_and_parent_paths(workflow, tmp_path):
    original = read_json(workflow[0] / "bundle/manifest.json")
    entry = original["artifacts"]["sentiment"]
    manifest = {**original, "artifacts": {"sentiment": entry}}
    write_json(tmp_path / "manifest.json", manifest)
    (tmp_path / entry["file"]).write_bytes(b"not-a-model")
    with pytest.raises(ValueError, match="Corrupt"):
        ModelBundle(tmp_path)
    manifest["artifacts"]["sentiment"]["file"] = "../outside.joblib"
    (tmp_path.parent / "outside.joblib").write_bytes(b"outside")
    write_json(tmp_path / "manifest.json", manifest)
    with pytest.raises(ValueError, match="path"):
        ModelBundle(tmp_path)


def test_model_bundle_rejects_runtime_version_mismatch(workflow, tmp_path):
    manifest = read_json(workflow[0] / "bundle/manifest.json")
    manifest["sklearn_version"] = "incompatible"
    write_json(tmp_path / "manifest.json", manifest)
    with pytest.raises(ValueError, match="same scikit-learn"):
        ModelBundle(tmp_path)


def test_trained_forecast_is_used_only_for_its_cinema(workflow):
    loaded = ModelBundle(workflow[0] / "bundle")
    candidates = [{"movie_id": 1, "date": "2026-11-08", "weekday": 6, "hour": 18}]
    trained = loaded.get("forecast:1")
    result = forecast({"cinema_id": 1, "history": [], "candidates": candidates}, trained)
    assert result["mode"] == "tuned_random_forest" and result["training_samples"] > 20
    other = forecast({"cinema_id": 2, "history": [], "candidates": candidates}, trained)
    assert other["mode"] == "smoothed_prior" and other["items"][0]["occupancy"] == .35


def test_api_loads_tuned_bundle_at_startup(workflow, monkeypatch):
    from app import app
    monkeypatch.setenv("AI_MODEL_DIR", str(workflow[0] / "bundle"))
    monkeypatch.setenv("AI_SERVICE_KEY", "isolated-test-key")
    with TestClient(app) as client:
        assert client.get("/health").json()["models"]["bundle_id"] == workflow[1]["bundle_id"]
        result = client.post("/sentiment", headers={"X-AI-Key": "isolated-test-key"}, json={"reviews": [{"id": 1, "text": "Phim hay"}]}).json()
        assert result["model"] == "tuned-tfidf-logistic-regression"
        assert result["training_samples"] == read_json(workflow[0] / "prepared/sentiment/manifest.json")["counts"]["train"]
        forecast_result = client.post("/forecast", headers={"X-AI-Key": "isolated-test-key"}, json={"cinema_id": 2, "history": [], "candidates": []}).json()
        assert forecast_result["mode"] == "smoothed_prior"


def test_recommendation_tuning_changes_real_serving_ranking():
    movies = [
        {"id": 1, "title": "Action Hero", "genres": "action", "bookable": False},
        {"id": 2, "title": "Action Hero Returns", "genres": "action", "popularity": 1},
        {"id": 3, "title": "Romantic Story", "genres": "romance", "popularity": 100},
    ]
    payload = {"movies": movies, "user_id": 1, "interactions": [{"user_id": 1, "movie_id": 1, "weight": 1}]}
    assert recommend(payload)["movies"][0]["id"] == 2
    assert recommend(payload, {"weights": [0, 0, 1], "svd_rank": 8})["movies"][0]["id"] == 3


def test_recommendation_metrics_ignore_future_catalog_popularity(workflow):
    data, _ = load_prepared(workflow[0] / "prepared/recommendation")
    movies = copy.deepcopy(data["movies"])
    before = ranking_metrics(data["splits"]["train"], data["splits"]["test"], movies, {}, 6, 3)
    movies[0]["popularity"] = 1e9
    after = ranking_metrics(data["splits"]["train"], data["splits"]["test"], movies, {}, 6, 3)
    assert before == after


def test_invalid_recommendation_weights_and_ids_are_rejected(tmp_path):
    with pytest.raises(ValueError, match="weights"):
        recommend({"movies": [], "interactions": []}, {"weights": [1, 1, 1]})
    write_json(tmp_path / "movies.json", [{"id": 1, "title": "Movie One"}, {"id": 2, "title": "Movie Two"}])
    write_csv(tmp_path / "events.csv", ["user_id", "movie_id", "timestamp"], [{"user_id": 1, "movie_id": 999, "timestamp": "2026-01-01T10:00:00+07:00"}])
    with pytest.raises(ValueError, match="absent"):
        recommendation_rows(tmp_path / "events.csv", tmp_path / "movies.json")


def test_local_timestamp_is_normalized_without_host_timezone():
    assert timestamp("2026-11-08 10:00:00") == "2026-11-08T03:00:00+00:00"


def test_cli_runs_from_another_working_directory(tmp_path):
    result = subprocess.run([sys.executable, str(ROOT / "local-ai-tuning/tune.py"), "--help"], cwd=tmp_path,
                            capture_output=True, text=True, timeout=20)
    assert result.returncode == 0 and "prepare" in result.stdout and "bundle" in result.stdout
