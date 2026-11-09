"""Research benchmarks for aggregated ticket data and MovieLens ratings."""
from __future__ import annotations

from collections import Counter, defaultdict
from datetime import date, datetime, timezone
import math
import random
import time

import joblib
import numpy as np
from sklearn.ensemble import RandomForestRegressor
from sklearn.feature_extraction import DictVectorizer
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.metrics import mean_absolute_error, mean_squared_error
from sklearn.model_selection import ParameterGrid
from sklearn.pipeline import make_pipeline
from threadpoolctl import threadpool_limits

from .common import write_json
from .data import temporal_split
from .ollama_trial import embed, model_digest
from .public_data import zipped_csv
from .seed import write_csv
from .training import ranking_metrics


def cinema_rows(raw):
    groups = defaultdict(lambda: [0, 0.0, 0])
    seen = set()
    for row in zipped_csv(raw / "cinema-ticket.zip", ".csv"):
        try:
            key = (date.fromisoformat(row["date"]).isoformat(), int(row["cinema_code"]), int(row["film_code"]))
            values = (int(row["ticket_use"]), float(row["capacity"]), int(row["show_time"]))
        except (TypeError, ValueError):
            continue
        sold, capacity, screenings = values
        if not math.isfinite(capacity) or capacity <= 0 or not 0 <= sold <= capacity or screenings < 1:
            continue
        identity = key + values
        if identity in seen:
            continue
        seen.add(identity)
        totals = groups[key]
        totals[0] += sold
        totals[1] += capacity
        totals[2] += screenings
    rows = [{"timestamp": day, "cinema_id": cinema, "movie_id": movie, "sold": values[0],
             "capacity": values[1], "screenings": values[2]}
            for (day, cinema, movie), values in groups.items()]
    counts = Counter(row["cinema_id"] for row in rows)
    busiest = [cinema for cinema, _ in counts.most_common(5)]
    return {cinema: sorted((r for r in rows if r["cinema_id"] == cinema),
                           key=lambda r: (r["timestamp"], r["movie_id"]))[-1000:] for cinema in busiest}


def daily_features(rows):
    result = []
    for row in rows:
        day = date.fromisoformat(row["timestamp"])
        result.append({"movie": str(row["movie_id"]), "weekday": str(day.weekday()),
                       "weekend": day.weekday() >= 5, "month": str(day.month),
                       "day_of_year": day.timetuple().tm_yday})
    return result


def occupancy(rows):
    return np.array([row["sold"] / row["capacity"] for row in rows])


def forecast_metrics(y, prediction):
    return {"mae": float(mean_absolute_error(y, prediction)),
            "rmse": float(math.sqrt(mean_squared_error(y, prediction)))}


@threadpool_limits.wrap(limits=1)
def run_forecast(raw, inputs, output, config):
    started = time.perf_counter()
    folder = output / "forecast"
    folder.mkdir(parents=True, exist_ok=True)
    per_cinema = cinema_rows(raw)
    write_csv(inputs / "forecast_daily.csv",
              ["timestamp", "cinema_id", "movie_id", "sold", "capacity", "screenings"],
              [row for rows in per_cinema.values() for row in rows])
    results = {}
    for cinema, rows in per_cinema.items():
        splits = temporal_split(rows)
        y = {name: occupancy(part) for name, part in splits.items()}
        x = {name: daily_features(part) for name, part in splits.items()}
        average = float(y["train"].mean())
        movie_values = defaultdict(list)
        for row, value in zip(splits["train"], y["train"]):
            movie_values[row["movie_id"]].append(value)
        movie_prior = {movie: float((sum(values) + 12 * average) / (len(values) + 12))
                       for movie, values in movie_values.items()}

        def priors(name):
            return {
                "mean": np.full(len(y[name]), average),
                "movie_prior": np.array([movie_prior.get(r["movie_id"], average) for r in splits[name]]),
            }

        validation = {name: forecast_metrics(y["validation"], predictions)
                      for name, predictions in priors("validation").items()}
        trials = []
        for params in ParameterGrid(config["forecast"]["grid"]):
            estimator = make_pipeline(DictVectorizer(), RandomForestRegressor(**params, random_state=7, n_jobs=1))
            estimator.fit(x["train"], y["train"])
            metric = forecast_metrics(y["validation"], estimator.predict(x["validation"]))
            trials.append((metric["mae"], params, estimator))
        _, best_params, best_forest = min(trials, key=lambda trial: trial[0])
        validation["random_forest"] = forecast_metrics(y["validation"], best_forest.predict(x["validation"]))
        selected = min(validation, key=lambda name: validation[name]["mae"])
        test = priors("test")
        test["random_forest"] = best_forest.predict(x["test"])
        results[str(cinema)] = {
            "counts": {name: len(part) for name, part in splits.items()},
            "range": {name: [min(r["timestamp"] for r in part), max(r["timestamp"] for r in part)]
                      for name, part in splits.items()},
            "selected_on_validation": selected,
            "random_forest_params": best_params,
            "validation": validation,
            "test": {name: forecast_metrics(y["test"], prediction) for name, prediction in test.items()},
        }
        joblib.dump({"scope": "public_daily_only", "selected": selected, "mean": average, "movie_prior": movie_prior,
                     "forest": best_forest}, folder / f"daily-cinema-{cinema}.joblib", compress=3)
        print(f"daily cinema {cinema}: {selected}, test MAE={results[str(cinema)]['test'][selected]['mae']:.4f}", flush=True)
    write_json(folder / "report.json", {
        "unit": "film-cinema-day", "rows": sum(map(len, per_cinema.values())),
        "target": "ticket_use divided by reported capacity", "cinemas": results,
        "seconds": round(time.perf_counter() - started, 2),
    })


def recommendation_data(raw, inputs):
    archive = raw / "movielens.zip"
    rows = [(int(row["timestamp"]), int(row["userId"]), int(row["movieId"]), float(row["rating"]))
            for row in zipped_csv(archive, "/ratings.csv") if float(row["rating"]) >= 4]
    times = sorted({row[0] for row in rows})
    first, second = times[int(.6 * len(times))], times[int(.8 * len(times))]
    history = [row for row in rows if row[0] < first]
    top_movies = {movie for movie, _ in Counter(row[2] for row in history).most_common(500)}
    # Sample identities with a fixed seed, independent of their rating values after filtering.
    eligible = sorted({row[1] for row in rows if row[2] in top_movies})
    users = set(random.Random(7).sample(eligible, min(300, len(eligible))))
    movies = [{"id": int(row["movieId"]), "title": row["title"], "genres": row["genres"].replace("|", " "),
               "bookable": True, "popularity": 0}
              for row in zipped_csv(archive, "/movies.csv") if int(row["movieId"]) in top_movies]
    parts = {"train": [], "validation": [], "test": []}
    for instant, user, movie, rating in sorted(rows):
        if user not in users or movie not in top_movies:
            continue
        split = "train" if instant < first else "validation" if instant < second else "test"
        parts[split].append({"user_id": user, "movie_id": movie,
                             "timestamp": datetime.fromtimestamp(instant, timezone.utc).isoformat(),
                             "weight": rating / 5})
    write_csv(inputs / "interactions.csv", ["user_id", "movie_id", "timestamp", "weight"],
              [event for part in parts.values() for event in part])
    write_json(inputs / "movies.json", movies)
    return parts, movies


@threadpool_limits.wrap(limits=1)
def run_recommendation(raw, inputs, output, config, model):
    started = time.perf_counter()
    folder = output / "recommendation"
    folder.mkdir(parents=True, exist_ok=True)
    parts, movies = recommendation_data(raw, inputs)
    texts = [f"{movie['title']} {movie['genres']}" for movie in movies]
    digest = model_digest(model)
    vectors = {
        "tfidf": TfidfVectorizer(strip_accents="unicode", ngram_range=(1, 2), max_features=12000).fit_transform(texts),
        "ollama": embed([{"text": text} for text in texts], model, digest, folder, "catalog"),
    }
    settings = config["recommendation"]
    k, max_users = settings["k"], settings["max_users"]
    grid = list(ParameterGrid(settings["grid"]))
    grid.append({"weights": [0, 0, 1], "svd_rank": 8})
    methods = {}
    for method, content in vectors.items():
        trials = [{"params": params, "validation": ranking_metrics(
            parts["train"], parts["validation"], movies, params, k, max_users, content=content)}
                  for params in grid]
        best = max(trials, key=lambda trial: trial["validation"]["ndcg_at_k"])
        test = ranking_metrics(parts["train"], parts["test"], movies, best["params"], k, max_users, content=content)
        seen_users = {row["user_id"] for row in parts["train"]}
        warm = [row for row in parts["test"] if row["user_id"] in seen_users]
        warm_test = ranking_metrics(parts["train"], warm, movies, best["params"], k, max_users,
                                    content=content) if warm else None
        methods[method] = {"trials": trials, "best": best, "test": test, "warm_test": warm_test}
        print(f"recommendation {method}: test NDCG@{k}={test['ndcg_at_k']:.4f}", flush=True)
    selected = max(methods, key=lambda method: methods[method]["best"]["validation"]["ndcg_at_k"])
    write_json(folder / "report.json", {
        "source": "MovieLens Small ratings >= 4 stars (positive-feedback proxy)",
        "catalog_size": len(movies), "users": len({row["user_id"] for part in parts.values() for row in part}),
        "counts": {name: len(part) for name, part in parts.items()},
        "ranges": {name: [part[0]["timestamp"], part[-1]["timestamp"]] for name, part in parts.items()},
        "ollama": {"model": model, "digest": digest}, "selected_on_validation": selected, "methods": methods,
        "seconds": round(time.perf_counter() - started, 2),
    })
