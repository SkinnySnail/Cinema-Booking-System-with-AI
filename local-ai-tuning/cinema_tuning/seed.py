"""Reproducible examples for exercising the pipeline, not real training evidence."""
import csv
from datetime import datetime, timedelta, timezone
from pathlib import Path
import shutil

from engine import LanguageModels
from .common import ROOT, new_directory, write_json


def write_csv(path, fields, rows):
    with Path(path).open("w", encoding="utf-8", newline="") as stream:
        writer = csv.DictWriter(stream, fieldnames=fields)
        writer.writeheader()
        writer.writerows(rows)


def seed(output):
    root = new_directory(output)
    shutil.copyfile(ROOT / "ai-service/data/sentiment.csv", root / "sentiment.csv")
    language = LanguageModels()
    write_csv(root / "intent.csv", ["text", "label", "group_id"], [
        {"text": text, "label": label, "group_id": f"{label}-{index}"}
        for label, examples in language.intent_examples.items() for index, text in enumerate(examples)
    ])
    start = datetime(2025, 1, 1, tzinfo=timezone(timedelta(hours=7)))
    shows, interactions = [], []
    for day in range(90):
        for movie in range(1, 4):
            for hour in [12, 18]:
                instant = (start + timedelta(days=day, hours=hour)).isoformat()
                sold = 10 + movie * 12 + (20 if hour == 18 else 0) + (day % 7) * 2
                shows.append({"showtime_id": len(shows) + 1, "timestamp": instant, "cinema_id": 1,
                              "movie_id": movie, "capacity": 100, "sold": sold})
        for user in range(1, 13):
            interactions.append({"user_id": user, "movie_id": (user % 3) * 4 + day % 4 + 1,
                                 "timestamp": (start + timedelta(days=day, hours=10, minutes=user)).isoformat(), "weight": 1})
    write_csv(root / "forecast.csv", ["showtime_id", "timestamp", "cinema_id", "movie_id", "capacity", "sold"], shows)
    write_csv(root / "interactions.csv", ["user_id", "movie_id", "timestamp", "weight"], interactions)
    genres = ["hanh dong anh hung", "tinh cam gia dinh", "hai huoc vui ve"]
    write_json(root / "movies.json", [
        {"id": mid, "title": f"Demo Movie {mid}", "genres": genres[(mid - 1) // 4],
         "description": genres[(mid - 1) // 4], "release_date": "2024-01-01"} for mid in range(1, 13)
    ])
    write_json(root / "provenance.json", {"provenance": "synthetic", "files": {
        "sentiment.csv": "bootstrap", "intent.csv": "bootstrap", "forecast.csv": "synthetic", "interactions.csv": "synthetic"},
        "notice": "Demo/seed only. Metrics from these data do not establish production quality."})
    return {"directory": str(root), "provenance": "demo only"}
