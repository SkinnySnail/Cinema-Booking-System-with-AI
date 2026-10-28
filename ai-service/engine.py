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


def normalize(text: str) -> str:
    text = unicodedata.normalize("NFD", text.lower().replace("đ", "d"))
    return " ".join("".join(c for c in text if unicodedata.category(c) != "Mn").split())


class LanguageModels:
    """Small, explicitly labelled bootstrap corpus; not a production quality claim."""
    def __init__(self):
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
        texts = [normalize(t) for group in examples.values() for t in group]
        labels = [label for label, group in examples.items() for _ in group]
        self.intent = make_pipeline(
            TfidfVectorizer(analyzer="char_wb", ngram_range=(2, 5)),
            LogisticRegression(C=12, max_iter=600, random_state=7),
        ).fit(texts, labels)

    def analyze_sentiment(self, reviews: list[dict]) -> dict:
        if not reviews:
            return {"items": [], "model": "tfidf-logistic-regression", "training_samples": self.sentiment_samples}
        probabilities = self.sentiment.predict_proba([r["text"] for r in reviews])
        classes = self.sentiment.classes_
        return {
            "items": [{"id": r["id"], "label": str(classes[int(np.argmax(p))]),
                       "confidence": round(float(max(p)), 4), "needs_review": bool(max(p) < .55)}
                      for r, p in zip(reviews, probabilities)],
            "model": "tfidf-logistic-regression", "training_samples": self.sentiment_samples,
        }

    def understand(self, message: str, movies: list[dict], cinemas: list[dict], today: str) -> dict:
        normalized = normalize(message)
        probabilities = self.intent.predict_proba([normalized])[0]
        intent = str(self.intent.classes_[int(np.argmax(probabilities))])
        confidence = float(max(probabilities))
        if confidence < .24:
            intent = "unknown"
        movie_matches = []
        for movie in movies:
            title = normalize(movie["title"])
            # "ngày mai" is a date entity, not automatically the movie "Mai".
            searchable = normalized.replace("ngay mai", "") if title == "mai" else normalized
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
        if "ngay kia" in normalized:
            requested_date = (day + timedelta(days=2)).isoformat()
        elif "ngay mai" in normalized or "tomorrow" in normalized:
            requested_date = (day + timedelta(days=1)).isoformat()
        match = re.search(r"\b(\d{1,2})/(\d{1,2})(?:/(\d{4}))?\b", normalized)
        if match:
            try:
                requested_date = date(int(match[3] or day.year), int(match[2]), int(match[1])).isoformat()
            except ValueError:
                return {"intent": "unknown", "confidence": 0, "error": "Ngày không hợp lệ"}
        hour = re.search(r"\b([01]?\d|2[0-3])\s*(?:h|gio|:)\s*([0-5]\d)?", normalized)
        return {"intent": intent, "confidence": round(confidence, 4), "date": requested_date,
                "date_explicit": bool(match or any(term in normalized for term in ["ngay mai", "ngay kia", "hom nay", "toi nay", "dem nay", "sang nay", "chieu nay", "tomorrow", "today"])),
                "hour": int(hour[1]) if hour else None,
                "movie_id": movie_matches[0]["id"] if movie_matches else None,
                "cinema_id": cinema_matches[0]["id"] if cinema_matches else None}


def recommend(payload: dict) -> dict:
    movies, events = payload["movies"], payload["interactions"]
    if not movies:
        return {"movies": [], "concessions": [], "mode": "cold_start", "model": "hybrid-tfidf-collaborative-svd"}
    ids = {int(m["id"]): i for i, m in enumerate(movies)}
    texts = [" ".join(str(m.get(k) or "") for k in ("title", "genres", "director", "cast", "description")) for m in movies]
    content = TfidfVectorizer(strip_accents="unicode", ngram_range=(1, 2), max_features=12000).fit_transform(texts)
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
        content_scores = cosine_similarity(content[ids[seed]], content)[0]
    elif history.sum() > 0:
        profile = content.multiply(history[:, None]).sum(axis=0) / history.sum()
        content_scores = cosine_similarity(np.asarray(profile), content)[0]
    if target in user_index and len(users) > 1:
        similarity = cosine_similarity(interactions[user_index[target]:user_index[target]+1], interactions)[0]
        similarity[user_index[target]] = 0
        if similarity.sum():
            collaborative = similarity @ interactions / similarity.sum()
        if min(interactions.shape) >= 3:
            # Low-rank user-item reconstruction, blended with neighbour scores.
            rank = min(16, min(interactions.shape) - 1)
            reducer = TruncatedSVD(n_components=rank, random_state=7)
            factors = reducer.fit_transform(np.log1p(interactions))
            latent = factors[user_index[target]] @ reducer.components_
            collaborative = .5 * collaborative + .5 * np.maximum(latent, 0)
    popularity = np.array([float(m.get("popularity", 0)) for m in movies])
    def scale(values):
        return values / values.max() if values.size and values.max() > 0 else values
    personalized = bool(history.sum() or seed in ids)
    scores = .55 * scale(content_scores) + .35 * scale(collaborative) + .10 * scale(popularity) if personalized else scale(popularity)
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


def forecast(payload: dict) -> dict:
    history, candidates = payload["history"], payload["candidates"]
    # Sold/capacity is an occupancy target, not raw sales favouring large halls.
    y = np.array([min(1., max(0., float(r["sold"]) / max(1, int(r["capacity"])))) for r in history])
    enough = len(history) >= 20 and len(set(np.round(y, 3))) > 1
    if enough:
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
    return {"mode": "random_forest" if enough else "smoothed_prior", "training_samples": len(history),
            "items": [{"movie_id": int(c["movie_id"]), "date": c["date"], "hour": int(c["hour"]),
                       "occupancy": round(float(np.clip(p, 0, 1)), 4)} for c, p in zip(candidates, predictions)]}
