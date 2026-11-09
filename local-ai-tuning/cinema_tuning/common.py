from __future__ import annotations

import hashlib
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "ai-service"))

from engine import normalize  # noqa: E402

TASKS = ("sentiment", "intent", "forecast", "recommendation")
LABELS = {
    "sentiment": {"positive", "negative", "neutral"},
    "intent": {"greeting", "recommend", "showtimes", "booking", "cinemas", "concessions", "loyalty", "payment", "cancel"},
}


def read_json(path):
    return json.loads(Path(path).read_text(encoding="utf-8-sig"))


def write_json(path, value):
    Path(path).write_text(json.dumps(value, ensure_ascii=False, indent=2, allow_nan=False) + "\n", encoding="utf-8")


def sha256(path):
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()


def new_directory(path):
    path = Path(path).resolve()
    if path.exists():
        raise ValueError(f"Output already exists; choose a new directory: {path}")
    path.mkdir(parents=True)
    return path


def digest_records(value):
    return hashlib.sha256(json.dumps(value, sort_keys=True, ensure_ascii=False).encode()).hexdigest()
