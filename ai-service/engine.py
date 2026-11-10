"""CPU-only ML baselines. No customer names, emails, or payment data are needed."""
from __future__ import annotations

import csv
import re
import unicodedata
from datetime import date, timedelta
from pathlib import Path

import numpy as np
from sklearn.ensemble import RandomForestRegressor
from sklearn.decomposition import TruncatedSVD
from sklearn.feature_extraction import DictVectorizer
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.linear_model import LogisticRegression
from sklearn.metrics.pairwise import cosine_similarity
from sklearn.pipeline import make_pipeline

from ollama_adapter import OllamaClassifier, OllamaUnavailable


def normalize(text: str) -> str:
    text = unicodedata.normalize("NFD", text.lower().replace("đ", "d"))
    return " ".join("".join(c for c in text if unicodedata.category(c) != "Mn").split())


class LanguageModels:
    """Small, explicitly labelled bootstrap corpus; not a production quality claim."""
    def __init__(self, bundle=None):
        self.sentiment_threshold = .55
        self.intent_threshold = .24
        self.sentiment_model_name = "tfidf-logistic-regression"
        self.intent_model_name = "tfidf-logistic-regression"
        with (Path(__file__).parent / "data/sentiment.csv").open(encoding="utf-8") as stream:
            rows = list(csv.DictReader(stream))
        self.sentiment_samples = len(rows)
        self.sentiment = make_pipeline(
            TfidfVectorizer(ngram_range=(1, 2), strip_accents="unicode"),
            LogisticRegression(C=5, class_weight="balanced", max_iter=600, random_state=7),
        ).fit([r["text"] for r in rows], [r["label"] for r in rows])
        examples = {
            "greeting": ["xin chào", "chào bạn", "hello", "hi", "bạn là ai", "giúp tôi với"],
            "recommend": ["gợi ý phim", "tôi nên xem phim gì", "phim hay nên xem", "tư vấn phim phù hợp", "có phim nào hay", "recommend movie", "tôi thích phim hành động"],
            "showtimes": ["lịch chiếu phim", "phim chiếu lúc mấy giờ", "suất chiếu tối nay", "ngày mai có phim gì", "rạp nào đang chiếu", "xem phim hôm nay", "phim có suất lúc 20 giờ"],
            "booking": ["đặt vé xem phim", "tôi muốn mua hai vé", "hướng dẫn đặt chỗ", "chọn ghế như thế nào", "mua vé phim", "book ticket"],
            "cinemas": ["rạp ở đâu", "địa chỉ rạp chiếu phim", "tìm rạp gần đây", "danh sách chi nhánh", "hotline của rạp", "rạp nào ở thành phố"],
            "concessions": ["combo bắp nước", "mua đồ ăn", "giá bắp rang", "có nước ngọt không", "gợi ý combo", "menu đồ uống"],
            "loyalty": ["cách tích điểm", "đổi điểm voucher", "hạng thành viên", "khuyến mãi giảm giá", "ưu đãi sinh nhật", "bao nhiêu điểm đổi quà"],
            "payment": ["thanh toán bằng gì", "có hỗ trợ momo không", "trả tiền vnpay", "cách thanh toán", "thanh toán thất bại", "tôi muốn trả bằng tiền mặt"],
            "cancel": ["hủy vé thế nào", "hoàn tiền vé", "đổi vé được không", "hủy đơn hàng", "trả lại vé", "chính sách hoàn vé"],
        }
        self.intent_examples = examples
        texts = [normalize(t) for group in examples.values() for t in group]
        labels = [label for label, group in examples.items() for _ in group]
        self.intent = make_pipeline(
            TfidfVectorizer(analyzer="char_wb", ngram_range=(2, 5)),
            LogisticRegression(C=12, max_iter=600, random_state=7),
        ).fit(texts, labels)
        self.default_intent = self.intent
        self.default_sentiment = self.sentiment
        self.default_sentiment_samples = self.sentiment_samples
        if bundle:
            for task in ("sentiment", "intent"):
                trained = bundle.get(task)
                if trained is not None:
                    estimator = trained["estimator"]
                    model_name = "tuned-tfidf-logistic-regression"
                    if "ollama" in trained:
                        estimator = OllamaClassifier(estimator, trained["ollama"])
                        model_name = estimator.name
                    setattr(self, task, estimator)
                    setattr(self, task + "_threshold", trained["threshold"])
                    setattr(self, task + "_model_name", model_name)
                    if task == "sentiment":
                        self.sentiment_samples = trained["training_samples"]

    def analyze_sentiment(self, reviews: list[dict]) -> dict:
        if not reviews:
            return {"items": [], "model": self.sentiment_model_name, "training_samples": self.sentiment_samples}
        texts = [r["text"] for r in reviews]
        estimator, threshold = self.sentiment, self.sentiment_threshold
        name, samples = self.sentiment_model_name, self.sentiment_samples
        try:
            probabilities = estimator.predict_proba(texts)
        except OllamaUnavailable:
            estimator, threshold = self.default_sentiment, .55
            name, samples = "tfidf-logistic-regression-fallback", self.default_sentiment_samples
            probabilities = estimator.predict_proba(texts)
        classes = estimator.classes_
        return {
            "items": [{"id": r["id"], "label": str(classes[int(np.argmax(p))]),
                       "confidence": round(float(max(p)), 4), "needs_review": bool(max(p) < threshold)}
                      for r, p in zip(reviews, probabilities)],
            "model": name, "training_samples": samples,
        }

    def understand(self, message: str, movies: list[dict], cinemas: list[dict], today: str,
                   genres: list[dict] | None = None, schedule_days: int = 7) -> dict:
        normalized = normalize(message)
        prefix, _, review = message.partition(":")
        if normalize(prefix) in {"phan tich binh luan", "phan tich cam xuc", "phan tich danh gia"}:
            return {"intent": "sentiment", "review_text": review.strip(), "intent_model": "chat-command"}
        if re.search(r"\b(?:du bao|du kien|uoc tinh)\b.*\b(?:suat|dong|lap day|nhu cau)\b", normalized):
            intent, confidence, intent_model = "forecast", 1.0, "chat-command"
        else:
            estimator, threshold, intent_model = self.intent, self.intent_threshold, self.intent_model_name
            text = message if isinstance(estimator, OllamaClassifier) else normalized
            try:
                probabilities = estimator.predict_proba([text])[0]
            except OllamaUnavailable:
                estimator, threshold, intent_model = self.default_intent, .24, "tfidf-logistic-regression-fallback"
                probabilities = estimator.predict_proba([normalized])[0]
            confidence = float(max(probabilities))
            intent = str(estimator.classes_[int(np.argmax(probabilities))]) if confidence >= threshold else "unknown"
        # Accent folding makes "chiếu" and "chiều" identical. "lịch chiếu MAI"
        # names the film; it is not the temporal phrase "chiều mai".
        tomorrow_pattern = r"(?<!lich )\b(?:(?:sang|trua|chieu|toi|dem)\s+(?:ngay\s+)?mai|ngay\s+mai|tomorrow)\b"
        tomorrow = re.search(tomorrow_pattern, normalized)
        after_tomorrow = re.search(r"(?<!lich )\b(?:(?:sang|trua|chieu|toi|dem)\s+(?:ngay\s+)?(?:kia|mot)|ngay\s+(?:kia|mot))\b", normalized)
        relative_today = re.search(r"\b(?:hom nay|today|(?:sang|trua|chieu|toi|dem)\s+nay)\b", normalized)
        movie_matches = []
        for movie in movies:
            title = normalize(movie["title"])
            # Strip only date mentions: "phim MAI tối mai" still names the movie.
            searchable = re.sub(tomorrow_pattern, " ", normalized) if title == "mai" else normalized
            if title and re.search(r"(?<!\w)" + re.escape(title) + r"(?!\w)", searchable):
                movie_matches.append(movie)
        movie_matches.sort(key=lambda m: len(m["title"]), reverse=True)
        cinema_matches = []
        for cinema in cinemas:
            name = normalize(cinema["name"])
            alias = re.sub(r"^(galaxy\s+cinema|galaxy|cinema)\s+", "", name)
            if name in normalized or (len(alias) >= 5 and alias in normalized):
                cinema_matches.append(cinema)
        day = date.fromisoformat(today)
        requested_date = today
        if after_tomorrow:
            requested_date = (day + timedelta(days=2)).isoformat()
        elif tomorrow:
            requested_date = (day + timedelta(days=1)).isoformat()
        match = re.search(r"\b(\d{1,2})/(\d{1,2})(?:/(\d{4}))?\b", normalized)
        if match:
            try:
                requested_date = date(int(match[3] or day.year), int(match[2]), int(match[1])).isoformat()
            except ValueError:
                return {"intent": "unknown", "confidence": 0, "error": "Ngày không hợp lệ"}
        requested_end = requested_date
        week = re.search(r"\b(?:(?:trong|ca|mot|1)\s+tuan|tuan nay|(?:7|bay)\s+ngay(?:\s+(?:toi|tiep theo))?)\b", normalized)
        next_week = re.search(r"(?<!mot )(?<!1 )\btuan\s+(?:sau|toi)\b", normalized)
        weekend = re.search(r"\bcuoi tuan\b", normalized)
        length = re.search(r"\b(\d{1,3})\s+ngay\s+(?:toi|tiep theo)\b", normalized)
        date_matches = list(re.finditer(r"\b(\d{1,2})/(\d{1,2})(?:/(\d{4}))?\b", normalized))
        range_requested = bool(week or next_week or weekend or length or len(date_matches)>1)
        try:
            if len(date_matches)>1:
                last = date_matches[-1]
                requested_end = date(int(last[3] or day.year), int(last[2]), int(last[1])).isoformat()
            elif length:
                count = int(length[1])
                if not 1 <= count <= 366:
                    raise ValueError('Invalid range length')
                requested_end = (date.fromisoformat(requested_date) + timedelta(days=count-1)).isoformat()
            elif next_week:
                start = day + timedelta(days=7-day.weekday())
                requested_date, requested_end = start.isoformat(), (start + timedelta(days=6)).isoformat()
            elif weekend:
                start = day + timedelta(days=5-day.weekday())
                requested_date, requested_end = start.isoformat(), (start + timedelta(days=1)).isoformat()
            elif week:
                requested_end = (date.fromisoformat(requested_date) + timedelta(days=max(1,min(7,schedule_days))-1)).isoformat()
        except ValueError:
            return {"intent": "unknown", "confidence": 0, "error": "Khoảng ngày không hợp lệ"}
        hour = re.search(r"\b([01]?\d|2[0-3])\s*(?:h|gio|:)\s*([0-5]\d)?", normalized)
        daypart = re.search(
            r"(?<!lich )\b(sang|trua|chieu|toi|dem)\s+(?:(?:ngay\s+)?(?:nay|mai|kia|mot)|\d{1,2}/\d{1,2}(?:/\d{4})?)\b"
            r"|\b(?:ngay\s+(?:mai|kia|mot)|hom nay|today|tomorrow)\s+(?:buoi\s+)?(sang|trua|chieu|toi|dem)\b", normalized)
        min_hour, max_hour = None, None
        if daypart and not hour:
            min_hour, max_hour = {"sang": (0, 12), "trua": (11, 14), "chieu": (12, 18),
                                  "toi": (18, None), "dem": (18, None)}[daypart[1] or daypart[2]]
        genre_ids, excluded_genre_ids = [], []
        for genre in genres or []:
            name = normalize(genre["name"])
            aliases = {name}
            if name == "khoa hoc vien tuong":
                aliases.update({"vien tuong", "sci-fi", "sci fi"})
            if name == "tinh cam":
                aliases.add("lang man")
            for alias in sorted(aliases, key=len, reverse=True):
                found = re.search(r"(?<!\w)" + re.escape(alias) + r"(?!\w)", normalized)
                if not found:
                    continue
                prefix = normalized[:found.start()]
                # Accent folding makes the genre "Hài" identical to the quantity "hai".
                if alias == "hai" and not re.search(r"\b(?:phim|the loai|thich|xem|chon)\s+$", prefix):
                    continue
                excluded = re.search(r"\b(?:khong|dung|tranh)(?:\s+\w+){0,4}\s+$", prefix)
                (excluded_genre_ids if excluded else genre_ids).append(int(genre["id"]))
                break
        audience_match = re.search(r"\b(?:cap doi|hen ho|date night|di (?:xem phim )?voi (?:nguoi yeu|ban gai|ban trai))\b", normalized)
        audience = "couple" if audience_match and not re.search(
            r"\b(?:khong|chang)(?:\s+\w+){0,3}\s+$", normalized[:audience_match.start()]) else None
        preferred_genre_ids = [int(genre["id"]) for genre in genres or []
                               if audience == "couple" and normalize(genre["name"]) in {"tinh cam", "hai"}
                               and int(genre["id"]) not in excluded_genre_ids]
        recommend_requested = audience == "couple" or intent == "recommend" or bool(re.search(
            r"\b(?:goi y|nen xem|nen chon|tu van phim|recommend)\b", normalized))
        schedule_requested = bool(re.search(r"\b(?:lich chieu|suat|luc may|may gio)\b", normalized))
        date_explicit = bool(match or tomorrow or after_tomorrow or relative_today or range_requested)
        # A classifier supplies one label. Preserve explicit scheduling constraints when
        # a recommendation shares the same question, regardless of the winning label.
        schedule_requested = schedule_requested or (recommend_requested and (date_explicit or bool(hour)))
        reset_movie_context = not movie_matches and (recommend_requested or (range_requested and schedule_requested) or bool(re.search(
            r"\b(?:con suat nao|co phim nao|phim gi|phim nao|lich chieu nao)\b", normalized)))
        return {"intent": intent, "intent_model": intent_model, "confidence": round(confidence, 4), "date": requested_date,
                "date_explicit": date_explicit, "schedule_requested": schedule_requested,
                "date_from": requested_date, "date_to": requested_end, "range_requested": range_requested,
                "recommend_requested": recommend_requested, "genre_ids": genre_ids,
                "excluded_genre_ids": excluded_genre_ids,
                "audience": audience, "preferred_genre_ids": preferred_genre_ids,
                "reset_movie_context": reset_movie_context,
                "hour": int(hour[1]) if hour else None,
                "min_hour": min_hour, "max_hour": max_hour,
                "movie_id": movie_matches[0]["id"] if movie_matches else None,
                "cinema_id": cinema_matches[0]["id"] if cinema_matches else None}


def recommend(payload: dict, tuning: dict | None = None, content=None) -> dict:
    tuning = tuning or {}
    weights = np.asarray(tuning.get("weights", [.55, .35, .10]), dtype=float)
    if weights.shape != (3,) or not np.all(np.isfinite(weights)) or np.any(weights < 0) or not np.isclose(weights.sum(), 1):
        raise ValueError("Recommendation weights must be three nonnegative numbers summing to one")
    svd_rank = int(tuning.get("svd_rank", 16))
    if not 1 <= svd_rank <= 64:
        raise ValueError("SVD rank must be in 1..64")
    movies, events = payload["movies"], payload["interactions"]
    if not movies:
        return {"movies": [], "concessions": [], "mode": "cold_start", "model": "hybrid-tfidf-collaborative-svd"}
    ids = {int(m["id"]): i for i, m in enumerate(movies)}
    if content is None:
        texts = [" ".join(str(m.get(k) or "") for k in ("title", "genres", "director", "cast", "description")) for m in movies]
        content = TfidfVectorizer(strip_accents="unicode", ngram_range=(1, 2), max_features=12000).fit_transform(texts)
    elif content.shape[0] != len(movies):
        raise ValueError("Content vectors must match the movie catalog")
    target = int(payload.get("user_id") or 0)
    # Cap the dense user-item matrix, retaining the viewer even for a large snapshot.
    users = list(dict.fromkeys(int(e["user_id"]) for e in events if int(e["movie_id"]) in ids))[:1000]
    if target and target not in users and any(int(e["user_id"]) == target for e in events):
        users = users[:999] + [target]
    user_index = {u: i for i, u in enumerate(users)}
    interactions = np.zeros((len(users), len(movies)), dtype=float)
    for event in events:
        if int(event["movie_id"]) in ids and int(event["user_id"]) in user_index:
            interactions[user_index[int(event["user_id"])]][ids[int(event["movie_id"])]] += max(0, float(event.get("weight", 1)))
    content_scores = np.zeros(len(movies))
    collaborative = np.zeros(len(movies))
    history = interactions[user_index[target]] if target in user_index else np.zeros(len(movies))
    seed = int(payload.get("movie_id") or 0)
    if seed in ids:
        index = ids[seed]
        content_scores = cosine_similarity(content[index:index + 1], content)[0]
    elif history.sum() > 0:
        profile = np.asarray(content.T @ history).reshape(1, -1) / history.sum()
        content_scores = cosine_similarity(profile, content)[0]
    if target in user_index and len(users) > 1:
        similarity = cosine_similarity(interactions[user_index[target]:user_index[target]+1], interactions)[0]
        similarity[user_index[target]] = 0
        if similarity.sum():
            collaborative = similarity @ interactions / similarity.sum()
        if min(interactions.shape) >= 3:
            # Low-rank user-item reconstruction, blended with neighbour scores.
            rank = min(svd_rank, min(interactions.shape) - 1)
            reducer = TruncatedSVD(n_components=rank, random_state=7)
            factors = reducer.fit_transform(np.log1p(interactions))
            latent = factors[user_index[target]] @ reducer.components_
            collaborative = .5 * collaborative + .5 * np.maximum(latent, 0)
    popularity = np.array([float(m.get("popularity", 0)) for m in movies])
    def scale(values):
        return values / values.max() if values.size and values.max() > 0 else values
    personalized = bool(history.sum() or seed in ids)
    scores = weights[0] * scale(content_scores) + weights[1] * scale(collaborative) + weights[2] * scale(popularity) if personalized else scale(popularity)
    ranked = sorted(range(len(movies)), key=lambda i: (-scores[i], -popularity[i], int(movies[i]["id"])))
    results = []
    for i in ranked:
        movie = movies[i]
        if not movie.get("bookable", True) or int(movie["id"]) == seed:
            continue
        results.append({"id": int(movie["id"]), "score": round(float(scores[i]), 5),
                        "reason": "Phù hợp với các phim bạn quan tâm" if personalized else "Được nhiều khán giả lựa chọn"})
        if len(results) >= payload.get("limit", 6):
            break
    concessions = sorted(payload.get("concessions", []), key=lambda c: (-float(c.get("affinity", 0)), -float(c.get("popularity", 0)), int(c["id"])))
    return {"movies": results, "concessions": [{"id": int(c["id"]), "reason": "Phù hợp lịch sử mua của bạn" if float(c.get("affinity", 0)) else "Combo được yêu thích"} for c in concessions[:3]],
            "mode": "hybrid" if personalized else "cold_start", "model": "hybrid-tfidf-collaborative-svd"}


def demand_features(row: dict) -> dict:
    return {"movie": str(row["movie_id"]), "weekday": str(row["weekday"]),
            "hour": str(row["hour"]), "weekend": int(row["weekday"]) >= 5}


def forecast(payload: dict, trained: dict | None = None) -> dict:
    history, candidates = payload["history"], payload["candidates"]
    # Sold/capacity is an occupancy target, not raw sales favouring large halls.
    y = np.array([min(1., max(0., float(r["sold"]) / max(1, int(r["capacity"])))) for r in history])
    enough = len(history) >= 20 and len(set(np.round(y, 3))) > 1
    use_trained = trained is not None and int(payload.get("cinema_id", 0)) == int(trained["cinema_id"])
    if use_trained:
        predictions = trained["estimator"].predict([demand_features(r) for r in candidates]) if candidates else []
    elif enough:
        model = make_pipeline(DictVectorizer(), RandomForestRegressor(n_estimators=60, min_samples_leaf=3, max_depth=8, random_state=7, n_jobs=1))
        model.fit([demand_features(r) for r in history], y)
        predictions = model.predict([demand_features(r) for r in candidates]) if candidates else []
    else:
        # Bayesian-style shrinkage to global occupancy for sparse/new movies.
        prior = float(y.mean()) if len(y) else .35
        predictions = []
        for candidate in candidates:
            values = [y[i] for i, r in enumerate(history) if int(r["movie_id"]) == int(candidate["movie_id"])]
            predictions.append((sum(values) + 5 * prior) / (len(values) + 5))
    mode = "tuned_random_forest" if use_trained else "random_forest" if enough else "smoothed_prior"
    return {"mode": mode, "training_samples": trained["training_samples"] if use_trained else len(history),
            "items": [{"movie_id": int(c["movie_id"]), "date": c["date"], "hour": int(c["hour"]),
                       "occupancy": round(float(np.clip(p, 0, 1)), 4)} for c, p in zip(candidates, predictions)]}
