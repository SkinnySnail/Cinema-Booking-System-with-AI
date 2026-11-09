"""Package locally trained Ollama heads and optional evaluated cinema forecasts."""
from __future__ import annotations

import argparse
from pathlib import Path

import joblib
import numpy as np
import sklearn

from cinema_tuning.common import digest_records, new_directory, read_json, sha256, write_json
from model_bundle import ModelBundle


def export(runs, output, forecast_bundle=None):
    artifacts, metadata = {}, {}
    for task, folder, model, threshold in (
        ("intent", "intent-qwen3-embedding-4b", "qwen3-embedding:4b", .24),
        ("sentiment", "sentiment", "qwen3-embedding:0.6b", .55),
    ):
        report = read_json(runs / folder / "report.json")
        spec = report["ollama"]
        if report["task"] != task or spec["model"] != model:
            raise ValueError(f"Unexpected {task} experiment")
        test = report["methods"]["ollama"]["test"]
        artifacts[task] = {"estimator": joblib.load(runs / folder / "ollama.joblib"), "ollama": spec,
                           "threshold": threshold, "training_samples": report["counts"]["train"]}
        metadata[task] = {"provenance": "local-experiment", "encoder": model, "test_macro_f1": test["macro_f1"]}

    report = read_json(runs / "recommendation/report.json")
    spec = artifacts["sentiment"]["ollama"]
    if any(report["ollama"][key] != spec[key] for key in ("model", "digest")):
        raise ValueError("Recommendation encoder differs from the packaged 0.6B model")
    selected = report["methods"]["ollama"]
    artifacts["recommendation"] = {**selected["best"]["params"], "ollama": spec}
    metadata["recommendation"] = {"provenance": "movielens-experiment", "encoder": spec["model"],
                                 "test_ndcg": selected["test"]["ndcg_at_k"],
                                 "baseline_ndcg": selected["test"]["baseline_ndcg_at_k"]}

    if forecast_bundle:
        forecast = ModelBundle(forecast_bundle)
        for task, model in forecast.models.items():
            if task != f"forecast:{model.get('cinema_id')}":
                raise ValueError("Only cinema-specific forecast artifacts may be added")
            entry = forecast.metadata[task]
            if entry["dataset"]["provenance"] != "real" or not entry["quality_gate_passed"]:
                raise ValueError("Forecast must pass evaluation on real cinema history")
            artifacts[task], metadata[task] = model, entry

    root = new_directory(output)
    entries = {}
    for task, artifact in artifacts.items():
        target = root / (task.replace(":", "-") + ".joblib")
        joblib.dump(artifact, target, compress=3)
        entries[task] = {"file": target.name, "sha256": sha256(target), "metadata": metadata[task]}
    manifest = {"schema_version": 1, "feature_contract": "cinema-ml-v1",
                "bundle_id": digest_records(entries)[:16], "artifacts": entries,
                "sklearn_version": sklearn.__version__, "numpy_version": np.__version__,
                "joblib_version": joblib.__version__}
    write_json(root / "manifest.json", manifest)
    return manifest


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--runs", required=True, type=Path)
    parser.add_argument("--out", required=True, type=Path)
    parser.add_argument("--forecast-bundle", type=Path)
    args = parser.parse_args()
    manifest = export(args.runs, args.out, args.forecast_bundle)
    print("Bundle", manifest["bundle_id"], "contains", ", ".join(manifest["artifacts"]))
