from __future__ import annotations

from collections import Counter, defaultdict
from datetime import datetime, timezone
import hashlib
import math
from pathlib import Path
import platform
import shutil

import joblib
import numpy as np
import sklearn
from sklearn.ensemble import RandomForestRegressor
from sklearn.feature_extraction import DictVectorizer
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import accuracy_score, classification_report, confusion_matrix, f1_score, mean_absolute_error, mean_squared_error
from sklearn.model_selection import ParameterGrid
from sklearn.pipeline import make_pipeline
from threadpoolctl import threadpool_limits

from engine import demand_features, recommend
from .common import LABELS, digest_records, new_directory, normalize, read_json, sha256, write_json
from .data import load_prepared


def classification_input(rows, task):
    return [normalize(row["text"]) if task == "intent" else row["text"] for row in rows]


def classifier(params, seed):
    analyzer = params["analyzer"]
    if analyzer not in {"word", "char_wb"} or not 0 < float(params["C"]) <= 100:
        raise ValueError("Invalid classification grid")
    return make_pipeline(
        TfidfVectorizer(analyzer=analyzer, ngram_range=(1, 2) if analyzer == "word" else (2, 5),
                        strip_accents="unicode", max_features=30000),
        LogisticRegression(C=params["C"], class_weight="balanced", max_iter=800, random_state=seed),
    )


def classification_metrics(estimator, rows, task, threshold=None):
    x, y = classification_input(rows, task), [r["label"] for r in rows]
    predictions = estimator.predict(x)
    probabilities = estimator.predict_proba(x).max(axis=1)
    labels = sorted(LABELS[task])
    result = {"samples": len(rows), "accuracy": float(accuracy_score(y, predictions)),
              "macro_f1": float(f1_score(y, predictions, labels=labels, average="macro", zero_division=0)),
              "per_class": classification_report(y, predictions, labels=labels, output_dict=True, zero_division=0),
              "labels": labels, "confusion_matrix": confusion_matrix(y, predictions, labels=labels).tolist()}
    if threshold is not None:
        accepted = probabilities >= threshold
        result["coverage"] = float(accepted.mean())
        result["accepted_accuracy"] = float(accuracy_score(np.asarray(y)[accepted], predictions[accepted])) if accepted.any() else None
        result["errors"] = [{"row": i, "actual": actual, "predicted": str(predicted), "confidence": float(confidence)}
                            for i, (actual, predicted, confidence) in enumerate(zip(y, predictions, probabilities)) if actual != predicted]
    return result


def confidence_threshold(estimator, rows, task, target_precision):
    x = classification_input(rows, task)
    confidence = estimator.predict_proba(x).max(axis=1)
    correct = estimator.predict(x) == np.array([r["label"] for r in rows])
    for threshold in sorted(set(confidence)):
        accepted = confidence >= threshold
        if accepted.sum() >= max(2, math.ceil(len(rows) * .2)) and correct[accepted].mean() >= target_precision:
            return float(threshold)
    # No validated confidence cut-off: defer all to human/help rather than invent certainty.
    return 1.01


def occupancy(rows):
    return np.array([r["sold"] / r["capacity"] for r in rows])


def regression_metrics(estimator, rows, baseline):
    y = occupancy(rows)
    predictions = np.clip(estimator.predict([demand_features(r) for r in rows]), 0, 1)
    return {"samples": len(rows), "mae": float(mean_absolute_error(y, predictions)),
            "rmse": float(math.sqrt(mean_squared_error(y, predictions))),
            "baseline_mae": float(mean_absolute_error(y, np.full(len(y), baseline)))}


@threadpool_limits.wrap(limits=1)
def ranking_metrics(history, holdout, movies, params, k, max_users, seed=7, content=None):
    truth = defaultdict(set)
    for event in holdout:
        truth[event["user_id"]].add(event["movie_id"])
    if not truth:
        raise ValueError("No held-out recommendation users")
    popularity = Counter()
    counts, latest = Counter(), {}
    for event in history:
        popularity[event["movie_id"]] += event["weight"]
        key = event["user_id"], event["movie_id"]
        counts[key] += event["weight"]
        latest[key] = max(latest.get(key, ""), event["timestamp"])
    # Match PHP's grouped, most-recent-first interaction snapshot before the 10k cap.
    keys = sorted(counts, key=lambda pair: (latest[pair], pair), reverse=True)[:10000]
    snapshot = [{"user_id": uid, "movie_id": mid, "weight": counts[uid, mid]} for uid, mid in keys]
    catalog = [{**movie, "popularity": popularity[movie["id"]]} for movie in movies]
    popular_ids = [m["id"] for m in sorted(catalog, key=lambda m: (-m["popularity"], m["id"]))][:k]
    totals, baseline_ndcg, recommended, cold = [], [], set(), 0
    history_users = {e["user_id"] for e in snapshot}

    def ndcg(ids, relevant):
        dcg = sum(1 / math.log2(i + 2) for i, mid in enumerate(ids) if mid in relevant)
        ideal = sum(1 / math.log2(i + 2) for i in range(min(k, len(relevant))))
        return dcg / ideal

    users = sorted(truth, key=lambda uid: hashlib.sha256(f"{seed}:{uid}".encode()).digest())[:max_users]
    for uid in users:
        result = recommend({"movies": catalog, "interactions": snapshot, "user_id": uid, "limit": k}, params, content)
        ids = [m["id"] for m in result["movies"]]
        recommended.update(ids)
        hits = len(set(ids) & truth[uid])
        totals.append((hits / k, hits / len(truth[uid]), ndcg(ids, truth[uid])))
        baseline_ndcg.append(ndcg(popular_ids, truth[uid]))
        cold += uid not in history_users
    mean = np.mean(totals, axis=0)
    return {"users": len(totals), "eligible_users": len(truth), "user_sampling": "deterministic ID hash",
            "cold_start_users": cold, "k": k,
            "precision_at_k": float(mean[0]), "recall_at_k": float(mean[1]), "ndcg_at_k": float(mean[2]),
            "baseline_ndcg_at_k": float(np.mean(baseline_ndcg)), "catalog_coverage": len(recommended) / len(catalog)}


@threadpool_limits.wrap(limits=1)
def tune(prepared, output, config):
    data, manifest = load_prepared(prepared)
    task, seed = data["task"], int(config["seed"])
    settings = config[task]
    train, validation = data["splits"]["train"], data["splits"]["validation"]
    grid = list(ParameterGrid(settings["grid"]))
    if not 1 <= len(grid) <= 36:
        raise ValueError("Grid must contain 1..36 CPU trials")
    if Path(output).exists():
        raise ValueError("Run output already exists")
    trials, best, best_value = [], None, -math.inf
    for params in grid:
        if task in LABELS:
            estimator = classifier(params, seed).fit(classification_input(train, task), [r["label"] for r in train])
            metrics = classification_metrics(estimator, validation, task)
            value = metrics["macro_f1"]
            artifact = {"estimator": estimator, "training_samples": len(train)}
        elif task == "forecast":
            if not 1 <= int(params["n_estimators"]) <= 300 or not 1 <= int(params["min_samples_leaf"]) <= 100 or not 1 <= int(params["max_depth"]) <= 32:
                raise ValueError("Forecast grid exceeds CPU bounds")
            estimator = make_pipeline(DictVectorizer(), RandomForestRegressor(**params, random_state=seed, n_jobs=1))
            estimator.fit([demand_features(r) for r in train], occupancy(train))
            baseline = float(occupancy(train).mean())
            metrics = regression_metrics(estimator, validation, baseline)
            value = -metrics["mae"]
            artifact = {"estimator": estimator, "cinema_id": data["cinema_id"], "training_samples": len(train), "baseline": baseline}
        else:
            k, users = int(settings["k"]), int(settings["max_users"])
            if not 1 <= k <= 12 or not 1 <= users <= 500:
                raise ValueError("Recommendation evaluation bounds: k 1..12, max_users 1..500")
            metrics = ranking_metrics(train, validation, data["movies"], params, k, users, seed)
            value, artifact = metrics["ndcg_at_k"], params
        trials.append({"params": params, "validation": metrics})
        if value > best_value:
            best_value, best = value, (params, metrics, artifact)
    params, metrics, artifact = best
    if task in LABELS:
        artifact["threshold"] = confidence_threshold(artifact["estimator"], validation, task, settings["review_precision"])
    root = new_directory(output)
    joblib.dump(artifact, root / "model.joblib", compress=3)
    report = {"schema_version": 1, "task": task, "created_at": datetime.now(timezone.utc).isoformat(),
              "dataset": manifest, "config": config, "seed": seed, "params": params,
              "validation": metrics, "trials": trials, "artifact_sha256": sha256(root / "model.joblib"),
              "sklearn_version": sklearn.__version__, "numpy_version": np.__version__, "python_version": platform.python_version(),
              "threshold": artifact.get("threshold"), "cinema_id": data.get("cinema_id"),
              "selection": "validation only; model fits train only, test not used for selection"}
    write_json(root / "run.json", report)
    return report


def load_run(directory):
    root = Path(directory)
    report = read_json(root / "run.json")
    if sha256(root / "model.joblib") != report["artifact_sha256"]:
        raise ValueError("Run artifact changed")
    if report["sklearn_version"] != sklearn.__version__:
        raise ValueError("Run requires the same scikit-learn version")
    return report, joblib.load(root / "model.joblib")


@threadpool_limits.wrap(limits=1)
def evaluate(run_directory, prepared):
    report, artifact = load_run(run_directory)
    data, manifest = load_prepared(prepared)
    if report["dataset"]["data_digest"] != manifest["data_digest"]:
        raise ValueError("Evaluation dataset differs from the training run")
    output = Path(run_directory) / "evaluation.json"
    if output.exists():
        raise ValueError("This run was already evaluated; inspect evaluation.json")
    task, test = report["task"], data["splits"]["test"]
    if task in LABELS:
        metrics = classification_metrics(artifact["estimator"], test, task, artifact["threshold"])
        settings = report["config"][task]
        passed = (metrics["macro_f1"] >= settings["min_macro_f1"]
                  and metrics["coverage"] >= settings["min_coverage"]
                  and (metrics["accepted_accuracy"] or 0) >= settings["review_precision"]
                  and all(metrics["per_class"][label]["support"] >= settings["min_test_per_label"] for label in LABELS[task]))
    elif task == "forecast":
        metrics = regression_metrics(artifact["estimator"], test, artifact["baseline"])
        settings = report["config"][task]
        passed = (metrics["mae"] <= settings["max_mae"] and metrics["mae"] <= metrics["baseline_mae"]
                  and metrics["samples"] >= settings["min_test_samples"])
    else:
        settings = report["config"][task]
        # Freeze training state. Validation outcomes are never added as implicit feedback.
        metrics = ranking_metrics(data["splits"]["train"], test, data["movies"], artifact, settings["k"], settings["max_users"], report["seed"])
        passed = (metrics["ndcg_at_k"] >= settings["min_ndcg"] and metrics["ndcg_at_k"] >= metrics["baseline_ndcg_at_k"]
                  and metrics["users"] >= settings["min_test_users"])
    result = {"task": task, "split": "test", "metrics": metrics, "quality_gate_passed": bool(passed),
              "artifact_sha256": report["artifact_sha256"], "data_digest": manifest["data_digest"],
              "provenance": manifest["provenance"], "evaluated_at": datetime.now(timezone.utc).isoformat()}
    write_json(output, result)
    return result


def bundle(runs, output, allow_demo=False, allow_below_threshold=False):
    entries, sources = {}, []
    for run in runs:
        report, _ = load_run(run)
        evaluation = read_json(Path(run) / "evaluation.json")
        if evaluation["artifact_sha256"] != report["artifact_sha256"] or evaluation["data_digest"] != report["dataset"]["data_digest"]:
            raise ValueError("Evaluation does not match run artifact/data")
        if evaluation["provenance"] != "real" and not allow_demo:
            raise ValueError("Demo/bootstrap data requires --allow-demo; not a production quality claim")
        if not evaluation["quality_gate_passed"] and not allow_below_threshold:
            raise ValueError("Quality gate failed; review evaluation before explicitly overriding")
        task = report["task"]
        if task == "forecast":
            task += ":" + str(report["cinema_id"])
        if task in entries:
            raise ValueError(f"Duplicate bundle task: {task}")
        filename = task.replace(":", "-") + ".joblib"
        metadata = {"dataset": report["dataset"], "params": report["params"], "test_metrics": evaluation["metrics"],
                    "quality_gate_passed": evaluation["quality_gate_passed"], "cinema_id": report.get("cinema_id")}
        entries[task] = {"file": filename, "sha256": report["artifact_sha256"], "metadata": metadata}
        sources.append((Path(run) / "model.joblib", filename))
    if not entries:
        raise ValueError("Provide at least one evaluated run")
    manifest = {"schema_version": 1, "feature_contract": "cinema-ml-v1", "sklearn_version": sklearn.__version__,
                "numpy_version": np.__version__, "joblib_version": joblib.__version__, "artifacts": entries,
                "bundle_id": digest_records(entries)[:16], "created_at": datetime.now(timezone.utc).isoformat(),
                "overrides": {"allow_demo": allow_demo, "allow_below_threshold": allow_below_threshold}}
    root = new_directory(output)
    for source, filename in sources:
        shutil.copyfile(source, root / filename)
    write_json(root / "manifest.json", manifest)
    return manifest
