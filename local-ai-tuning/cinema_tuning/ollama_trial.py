"""Train a linear classifier over local Ollama embeddings and compare with TF-IDF."""
from __future__ import annotations

import json
import time
from urllib.request import Request, urlopen

import joblib
import numpy as np
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import classification_report, confusion_matrix, f1_score
from sklearn.model_selection import ParameterGrid
from threadpoolctl import threadpool_limits

from .common import digest_records, read_json, write_json
from .training import classifier


BASE_URL = "http://127.0.0.1:11434"
MODEL = "qwen3-embedding:0.6b"


def ollama_json(path, body=None):
    payload = json.dumps(body, ensure_ascii=False).encode("utf-8") if body is not None else None
    request = Request(BASE_URL + path, data=payload, headers={"Content-Type": "application/json"})
    with urlopen(request, timeout=120) as response:
        return json.load(response)


def model_digest(model):
    for entry in ollama_json("/api/tags")["models"]:
        if entry["name"] == model:
            return entry["digest"]
    raise ValueError(f"Ollama model is missing. Run ollama pull {model}")


def embed(rows, model, digest, folder, split):
    texts = [row["text"] for row in rows]
    key = digest_records([digest, 512, texts])[:20]
    target = folder / f"{split}-{key}.npy"
    if target.exists():
        return np.load(target, allow_pickle=False)
    vectors = []
    for start in range(0, len(texts), 64):
        batch = texts[start:start + 64]
        result = ollama_json("/api/embed", {
            "model": model, "input": batch, "keep_alive": "15m",
            "options": {"num_ctx": 512},
        })
        array = np.asarray(result["embeddings"], dtype=np.float32)
        if array.ndim != 2 or len(array) != len(batch) or not np.isfinite(array).all():
            raise ValueError("Invalid Ollama embedding response")
        vectors.append(array)
        if start % 512 == 0:
            print(f"{folder.name} {split}: {start + len(batch)}/{len(texts)}", flush=True)
    features = np.vstack(vectors)
    with target.with_suffix(".tmp").open("wb") as stream:
        np.save(stream, features, allow_pickle=False)
    target.with_suffix(".tmp").replace(target)
    return features


def scores(y, estimator, x):
    predicted = estimator.predict(x)
    return {
        "samples": len(y),
        "accuracy": float(np.mean(predicted == np.asarray(y))),
        "macro_f1": float(f1_score(y, predicted, average="macro")),
        "per_class": classification_report(y, predicted, output_dict=True, zero_division=0),
        "labels": estimator.classes_.tolist(),
        "confusion_matrix": confusion_matrix(y, predicted, labels=estimator.classes_).tolist(),
    }


def predict_text(text, folder):
    report = read_json(folder / "report.json")
    method = report["selected"]
    if method == "ollama":
        info = report["ollama"]
        if model_digest(info["model"]) != info["digest"]:
            raise ValueError("The installed Ollama checkpoint differs from the trained run")
        features = np.asarray(ollama_json("/api/embed", {
            "model": info["model"], "input": [text], "options": {"num_ctx": info["context"]},
        })["embeddings"], dtype=np.float32)
        if features.shape != (1, info["dimension"]):
            raise ValueError("Unexpected embedding dimension")
    else:
        features = [text]
    estimator = joblib.load(folder / f"{method}.joblib")
    probabilities = estimator.predict_proba(features)[0]
    best = int(np.argmax(probabilities))
    return {"method": method, "label": str(estimator.classes_[best]), "confidence": float(probabilities[best])}


@threadpool_limits.wrap(limits=1)
def train_text(task, splits, folder, config, model=MODEL, validation_only=False):
    started = time.perf_counter()
    folder.mkdir(parents=True, exist_ok=True)
    digest = model_digest(model)
    classes = {name: [r["label"] for r in rows] for name, rows in splits.items()}
    raw = {name: [r["text"] for r in rows] for name, rows in splits.items()}
    candidates = {}
    trials = []
    for method in ("tfidf", "ollama"):
        features = raw if method == "tfidf" else {
            split: embed(splits[split], model, digest, folder, split)
            for split in ("train", "validation")
        }
        grid = ParameterGrid(config[task]["grid"]) if method == "tfidf" else [
            {"C": c} for c in (.25, 1, 4, 16, 64)
        ]
        for params in grid:
            estimator = classifier(params, 7) if method == "tfidf" else LogisticRegression(
                C=params["C"], class_weight="balanced", max_iter=1000, random_state=7,
            )
            estimator.fit(features["train"], classes["train"])
            macro = float(f1_score(classes["validation"], estimator.predict(features["validation"]), average="macro"))
            trials.append({"method": method, "params": params, "validation_macro_f1": macro})
            if method not in candidates or macro > candidates[method][0]:
                candidates[method] = macro, estimator, params
    selected = max(candidates, key=lambda method: candidates[method][0])
    dimension = features["validation"].shape[1]
    test_features = None if validation_only else {
        "tfidf": raw["test"], "ollama": embed(splits["test"], model, digest, folder, "test"),
    }
    report = {
        "task": task, "selected_on": "validation_macro_f1", "selected": selected,
        "ollama": {"model": model, "digest": digest, "context": 512, "dimension": dimension},
        "counts": {name: len(rows) for name, rows in splits.items()},
        "label_counts": {
            name: {label: labels.count(label) for label in sorted(set(labels))}
            for name, labels in classes.items()
        },
        "dataset_digest": digest_records(splits), "trials": trials, "methods": {},
    }
    for method, (macro, estimator, params) in candidates.items():
        joblib.dump(estimator, folder / f"{method}.joblib", compress=3)
        report["methods"][method] = {"params": params, "validation_macro_f1": macro}
        if test_features is not None:
            report["methods"][method]["test"] = scores(classes["test"], estimator, test_features[method])
    report["seconds"] = round(time.perf_counter() - started, 2)
    write_json(folder / "report.json", report)
    return report
