"""Prepare the public datasets for research runs, preserving their original units."""
from __future__ import annotations

from collections import Counter, defaultdict
from datetime import date, datetime, timezone
import csv
import io
import json
import random
import tarfile
import zipfile

from sklearn.model_selection import train_test_split

from .common import normalize, read_json, write_json
from .data import classification_rows, classification_split
from .seed import write_csv


def sentiment_data(raw, output):
    def rows(splits):
        grouped = defaultdict(dict)
        for name in splits:
            for row in read_json(raw / f"uit-{name}.json"):
                text, label = row["Sentence"].strip(), row["Sentiment"]
                if text and label in {"positive", "neutral", "negative"}:
                    grouped[normalize(text)][label] = text
        return [{"text": next(iter(labels.values())), "label": next(iter(labels))}
                for labels in grouped.values() if len(labels) == 1]

    test = rows(["test"])
    test_keys = {normalize(row["text"]) for row in test}
    development = [r for r in rows(["train", "valid"]) if normalize(r["text"]) not in test_keys]
    rng = random.Random(7)
    dataset = []
    for label in ("negative", "neutral", "positive"):
        items = [r for r in development if r["label"] == label]
        dataset.extend(rng.sample(items, min(1600, len(items))))
    train, validation = train_test_split(
        dataset, test_size=.2, random_state=7, stratify=[r["label"] for r in dataset],
    )
    write_csv(output / "sentiment.csv", ["text", "label"], dataset)
    write_csv(output / "sentiment-test.csv", ["text", "label"], test)
    return {"train": train, "validation": validation, "test": test}


def intent_data(raw, output, families_file):
    families = read_json(families_file)
    phoatis = (raw / "phoatis-sentences.txt").read_text(encoding="utf-8").splitlines()
    phoatis_labels = (raw / "phoatis-labels.txt").read_text(encoding="utf-8").splitlines()
    if len(phoatis) != len(phoatis_labels):
        raise ValueError("PhoATIS sentences and labels are out of sync")
    rows = []
    for label, groups in families.items():
        for index, group in enumerate(groups):
            source = "synthetic-cinema"
            if isinstance(group, dict):
                line = group["phoatis_line"]
                if not phoatis[line - 1] or "flight" not in phoatis_labels[line - 1]:
                    raise ValueError(f"Unexpected PhoATIS template at line {line}")
                source = f"phoatis-adapted-train-line-{line}"
                group = group["template"]
            template, *values = group
            for value in values:
                rows.append({"text": template.format(value), "label": label, "source": source,
                             "group_id": f"cinema-{label}-{index}"})

    mapping = {"general_greet": "greeting", "recommendation_movies": "recommend"}
    with tarfile.open(raw / "massive.tar.gz", "r:gz") as archive:
        member = next(member for member in archive if member.name.endswith("/vi-VN.jsonl"))
        with archive.extractfile(member) as stream:
            external = [json.loads(line) for line in stream]
    external = [r for r in external if r["intent"] in mapping and r["partition"] == "train"]
    external.sort(key=lambda r: r["id"])
    counts = Counter()
    present = {normalize(row["text"]) for row in rows}
    for row in external:
        key = normalize(row["utt"])
        if counts[row["intent"]] >= 24 or not key or key in present:
            continue
        present.add(key)
        counts[row["intent"]] += 1
        rows.append({"text": row["utt"], "label": mapping[row["intent"]],
                     "source": "massive-vi-VN-1.1", "group_id": "massive-" + row["intent"]})

    # Preserve the dataset boundaries by holding out whole cinema phrasing families.
    destination = output / "intent.csv"
    write_csv(destination, ["text", "label", "group_id", "source"], rows)
    grouped = classification_rows(destination, "intent")
    domain = [r for r in grouped if "massive-" not in r["group"]]
    splits = classification_split(domain, 7)
    splits["train"].extend(r for r in grouped if "massive-" in r["group"])
    return splits


def zipped_csv(archive, suffix):
    with zipfile.ZipFile(archive) as container:
        member = next(name for name in container.namelist() if name.endswith(suffix))
        with container.open(member) as stream:
            yield from csv.DictReader(io.TextIOWrapper(stream, encoding="utf-8-sig", newline=""))
