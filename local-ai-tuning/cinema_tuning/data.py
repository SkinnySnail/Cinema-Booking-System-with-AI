from __future__ import annotations

import csv
from datetime import datetime, timedelta, timezone
from pathlib import Path

import numpy as np
from sklearn.model_selection import StratifiedGroupKFold

from .common import LABELS, digest_records, new_directory, normalize, read_json, sha256, write_json


def read_csv(path, required, optional=()):
    with Path(path).open(encoding="utf-8-sig", newline="") as stream:
        reader = csv.DictReader(stream)
        fields = set(reader.fieldnames or [])
        if not required <= fields or fields - required - set(optional):
            raise ValueError(f"CSV columns must contain {sorted(required)}; optional {sorted(optional)}")
        rows = list(reader)
    if not rows or len(rows) > 100000:
        raise ValueError("Dataset must contain 1..100000 rows")
    if any(None in row or any(value is None for value in row.values()) for row in rows):
        raise ValueError("Malformed CSV row")
    return rows


def positive_id(value):
    number = int(value)
    if number <= 0:
        raise ValueError("IDs must be positive integers")
    return number


def timestamp(value):
    if len(value.strip()) < 16:
        raise ValueError("Timestamp must include date and time (ISO 8601)")
    parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=timezone(timedelta(hours=7)))
    return parsed.astimezone(timezone.utc).isoformat()


def classification_rows(path, task):
    rows = read_csv(path, {"text", "label"}, {"group_id", "source", "rating", "review_id"})
    cleaned, by_text, parents = [], {}, {}

    def root(key):
        parents.setdefault(key, key)
        if parents[key] != key:
            parents[key] = root(parents[key])
        return parents[key]

    for row in rows:
        text, label = row["text"].strip(), row["label"].strip()
        if not text or len(text) > 5000 or label not in LABELS[task]:
            raise ValueError(f"Invalid text/label for {task}; label each row before training")
        canonical = normalize(text)
        group = row.get("group_id", "").strip() or canonical
        a, b = root("text:" + canonical), root("group:" + group)
        parents[a] = b
        if canonical in by_text:
            if by_text[canonical]["label"] != label:
                raise ValueError("Conflicting labels for the same normalized text")
            continue
        cleaned_row = {"text": text, "label": label, "canonical": canonical}
        by_text[canonical] = cleaned_row
        cleaned.append(cleaned_row)
    for row in cleaned:
        row["group"] = root("text:" + row.pop("canonical"))
    if {r["label"] for r in cleaned} != LABELS[task]:
        raise ValueError(f"Dataset must cover all labels: {sorted(LABELS[task])}")
    return cleaned


def classification_split(rows, seed):
    labels = np.array([r["label"] for r in rows])
    groups = np.array([r["group"] for r in rows])
    expected = set(labels)
    for attempt in range(30):
        splitter = StratifiedGroupKFold(n_splits=5, shuffle=True, random_state=seed + attempt)
        folds = [test.tolist() for _, test in splitter.split(np.zeros(len(rows)), labels, groups)]
        train = [i for fold in folds[2:] for i in fold]
        indexes = {"train": train, "validation": folds[1], "test": folds[0]}
        if all(set(labels[ids]) == expected for ids in indexes.values()):
            result = {name: [rows[i] for i in ids] for name, ids in indexes.items()}
            if all(sum(r["label"] == label for r in result["train"]) >= 2 for label in expected):
                return result
    raise ValueError("Need more independently grouped examples per label to make train/validation/test splits")


def temporal_split(rows):
    times = sorted({row["timestamp"] for row in rows})
    if len(times) < 10:
        raise ValueError("Need at least 10 distinct timestamps for chronological splits")
    validation_start, test_start = times[int(len(times) * .6)], times[int(len(times) * .8)]
    result = {"train": [], "validation": [], "test": []}
    for row in rows:
        name = "train" if row["timestamp"] < validation_start else "validation" if row["timestamp"] < test_start else "test"
        result[name].append(row)
    return result


def forecast_rows(path, cinema_id):
    if not cinema_id or cinema_id <= 0:
        raise ValueError("Forecast requires --cinema-id to preserve cinema isolation")
    raw = read_csv(path, {"showtime_id", "timestamp", "cinema_id", "movie_id", "capacity", "sold"})
    result, seen = [], set()
    for row in raw:
        if positive_id(row["cinema_id"]) != cinema_id:
            continue
        showtime = positive_id(row["showtime_id"])
        if showtime in seen:
            raise ValueError("Duplicate showtime: one final observation per screening is required")
        seen.add(showtime)
        capacity, sold = int(row["capacity"]), int(row["sold"])
        if capacity <= 0 or not 0 <= sold <= capacity:
            raise ValueError("Invalid occupancy: require capacity > 0 and 0 <= sold <= capacity")
        instant = timestamp(row["timestamp"])
        local = datetime.fromisoformat(instant).astimezone(timezone(timedelta(hours=7)))
        result.append({"showtime_id": showtime, "timestamp": instant, "cinema_id": cinema_id,
                       "movie_id": positive_id(row["movie_id"]), "capacity": capacity, "sold": sold,
                       "weekday": local.weekday(), "hour": local.hour // 3 * 3})
    if len(result) < 40:
        raise ValueError("Need at least 40 historical screenings for the selected cinema")
    return result


def recommendation_rows(path, movies_path):
    catalog = read_json(movies_path)
    if not isinstance(catalog, list) or not 2 <= len(catalog) <= 500:
        raise ValueError("Movie catalog must contain 2..500 movies")
    movies, ids = [], set()
    fields = {"id", "title", "genres", "director", "cast", "description", "release_date", "popularity", "bookable"}
    for movie in catalog:
        if not isinstance(movie, dict) or set(movie) - fields:
            raise ValueError("Unexpected movie fields")
        mid = positive_id(movie["id"])
        if mid in ids or not str(movie.get("title", "")).strip():
            raise ValueError("Duplicate movie ID or empty title")
        ids.add(mid)
        movies.append({**{k: v for k, v in movie.items() if k not in {"popularity", "bookable"}},
                       "id": mid, "bookable": True, "popularity": 0})
    rows = read_csv(path, {"user_id", "movie_id", "timestamp"}, {"weight"})
    result, seen = [], set()
    for row in rows:
        uid, mid, instant = positive_id(row["user_id"]), positive_id(row["movie_id"]), timestamp(row["timestamp"])
        if mid not in ids:
            raise ValueError("Interaction references a movie absent from the catalog")
        weight = float(row.get("weight") or 1)
        if not np.isfinite(weight) or not 0 < weight <= 100:
            raise ValueError("Interaction weight must be finite and in (0,100]")
        key = uid, mid, instant
        if key in seen:
            raise ValueError("Duplicate interaction; aggregate tickets from the same event first")
        seen.add(key)
        result.append({"user_id": uid, "movie_id": mid, "timestamp": instant, "weight": weight})
    return result, movies


def prepare(task, source, output, seed=7, movies=None, cinema_id=None, provenance="real"):
    extras = {}
    if task in LABELS:
        rows = classification_rows(source, task)
        splits = classification_split(rows, seed)
    elif task == "forecast":
        rows = forecast_rows(source, cinema_id)
        splits = temporal_split(rows)
        extras["cinema_id"] = cinema_id
        if len(splits["train"]) < 20:
            raise ValueError("Forecast train split must contain at least 20 screenings")
    else:
        rows, extras["movies"] = recommendation_rows(source, movies)
        splits = temporal_split(rows)
    data = {"task": task, "splits": splits, **extras}
    manifest = {"schema_version": 1, "task": task, "seed": seed, "provenance": provenance,
                "source_sha256": sha256(source), "data_digest": digest_records(data),
                "counts": {name: len(items) for name, items in splits.items()}}
    if movies:
        manifest["movies_sha256"] = sha256(movies)
    # Seed exports carry provenance; callers cannot accidentally label them as real.
    sidecar = Path(source).parent / "provenance.json"
    if sidecar.exists():
        source_meta = read_json(sidecar)
        origin = source_meta.get("files", {}).get(Path(source).name, source_meta.get("provenance"))
        if origin in {"bootstrap", "synthetic"}:
            manifest["provenance"] = origin
    root = new_directory(output)
    write_json(root / "data.json", data)
    write_json(root / "manifest.json", manifest)
    return manifest


def load_prepared(directory):
    root = Path(directory)
    data, manifest = read_json(root / "data.json"), read_json(root / "manifest.json")
    if manifest.get("schema_version") != 1 or digest_records(data) != manifest["data_digest"]:
        raise ValueError("Prepared dataset changed; run prepare again into a new directory")
    return data, manifest
