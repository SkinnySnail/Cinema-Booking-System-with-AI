import math
import numpy as np
import pytest
from fastapi.testclient import TestClient
from app import app
from engine import LanguageModels, forecast, recommend

@pytest.fixture(scope="module")
def language():
    return LanguageModels()

@pytest.fixture
def movies():
    return [
        {"id": 1, "title": "Người Hùng", "genres": "hành động", "description": "siêu anh hùng cứu thế giới", "popularity": 2, "bookable": False},
        {"id": 2, "title": "Anh Hùng Trở Lại", "genres": "hành động", "description": "siêu anh hùng cứu thế giới", "popularity": 1, "bookable": True},
        {"id": 3, "title": "Tình Yêu", "genres": "lãng mạn", "description": "tình yêu gia đình", "popularity": 100, "bookable": True},
    ]

def test_cold_start_uses_bookable_popularity(movies):
    result = recommend({"movies": movies, "interactions": [], "concessions": [], "limit": 6})
    assert result["mode"] == "cold_start"
    assert [r["id"] for r in result["movies"]] == [3, 2]

def test_content_profile_outranks_unrelated_popularity(movies):
    result = recommend({"movies": movies, "interactions": [{"user_id": 7, "movie_id": 1, "weight": 3}], "user_id": 7})
    assert result["movies"][0]["id"] == 2
    assert result["mode"] == "hybrid"

def test_similar_movie_excludes_seed_and_unbookable(movies):
    assert [m["id"] for m in recommend({"movies": movies, "interactions": [], "movie_id": 2})["movies"]] == [3]


def test_similar_movie_with_dense_ollama_vectors(movies):
    vectors = np.array([[1, 0], [.9, .1], [0, 1]], dtype=np.float32)
    result = recommend({"movies": movies, "interactions": [], "movie_id": 1}, content=vectors)
    assert [movie["id"] for movie in result["movies"]] == [2, 3]

def test_collaborative_and_svd_have_finite_bounded_scores(movies):
    events = [{"user_id": 1, "movie_id": 1}, {"user_id": 2, "movie_id": 1},
              {"user_id": 2, "movie_id": 2}, {"user_id": 3, "movie_id": 3}]
    result = recommend({"movies": movies, "interactions": events, "user_id": 1})
    assert result["movies"][0]["id"] == 2
    assert all(math.isfinite(m["score"]) and 0 <= m["score"] <= 1 for m in result["movies"])

def test_empty_catalog():
    assert recommend({"movies": [], "interactions": []})["movies"] == []

def test_concession_personal_affinity(movies):
    result = recommend({"movies": movies, "interactions": [], "concessions": [
        {"id": 1, "popularity": 100, "affinity": 0}, {"id": 2, "popularity": 2, "affinity": 3}]})
    assert result["concessions"][0]["id"] == 2

@pytest.mark.parametrize("text,label", [
    ("Bộ phim hay và rất đáng tiền", "positive"),
    ("Phim rất dở và làm tôi thất vọng", "negative"),
    ("Chất lượng phim ở mức bình thường", "neutral"),
    ("khong hay qua chan phi tien", "negative"),
])
def test_sentiment_independent_sentences(language, text, label):
    item = language.analyze_sentiment([{"id": 12, "text": text}])["items"][0]
    assert item["id"] == 12 and item["label"] == label
    assert 0 <= item["confidence"] <= 1

def test_entity_dates_and_vietnamese_accents(language):
    result = language.understand("Lich chieu phim Nguoi Hung o Nguyen Du ngay mai luc 20h", [
        {"id": 1, "title": "Người Hùng"}], [{"id": 2, "name": "Galaxy Nguyễn Du"}], "2026-10-27")
    assert result["movie_id"] == 1 and result["cinema_id"] == 2
    assert result["date"] == "2026-10-28" and result["hour"] == 20

def test_tomorrow_is_not_movie_mai(language):
    result = language.understand("Lịch chiếu ngày mai", [{"id": 2, "title": "Mai"}], [], "2026-10-27")
    assert result["movie_id"] is None and result["intent"] == "showtimes"

def test_invalid_calendar_date(language):
    assert language.understand("lịch chiếu 31/02", [], [], "2026-10-27")["intent"] == "unknown"


def test_relative_date_context_distinguishes_explicit_today(language):
    assert language.understand("tối nay", [], [], "2026-10-27")["date_explicit"] is True
    assert language.understand("ở Nguyễn Du", [], [], "2026-10-27")["date_explicit"] is False


def test_chat_sentiment_keeps_the_original_comment(language):
    result = language.understand("Phân tích bình luận: Phim rất hay!", [], [], "2026-11-09")
    assert result["intent"] == "sentiment" and result["review_text"] == "Phim rất hay!"


def test_chat_forecast_resolves_cinema_and_evening(language):
    result = language.understand("Suất nào dự kiến đông tại Nguyễn Du tối nay?", [],
                                 [{"id": 1, "name": "Galaxy Nguyễn Du"}], "2026-11-09")
    assert result["intent"] == "forecast" and result["cinema_id"] == 1 and result["min_hour"] == 18

def test_sparse_demand_prior_is_explicit():
    result = forecast({"history": [], "candidates": [{"movie_id": 1, "date": "2026-10-27", "weekday": 1, "hour": 18}]})
    assert result["mode"] == "smoothed_prior" and result["training_samples"] == 0
    assert result["items"][0]["occupancy"] == .35

def test_forecast_learns_from_occupancy_not_capacity():
    history = [{"movie_id": movie, "weekday": day % 7, "hour": 18, "capacity": 100, "sold": sold}
               for day in range(28) for movie, sold in [(1, 90), (2, 10)]]
    candidates = [{"movie_id": movie, "date": "2026-10-27", "weekday": 1, "hour": 18} for movie in [1, 2, 999]]
    result = forecast({"history": history, "candidates": candidates})
    assert result["mode"] == "random_forest"
    assert result["items"][0]["occupancy"] > result["items"][1]["occupancy"]
    assert all(0 <= r["occupancy"] <= 1 for r in result["items"])

def test_internal_api_auth_and_validation(monkeypatch):
    monkeypatch.setenv("AI_SERVICE_KEY", "test-key")
    with TestClient(app) as client:
        assert client.get("/health").json()["model_ready"] is True
        assert client.post("/sentiment", json={"reviews": []}).status_code == 401
        headers = {"X-AI-Key": "test-key"}
        response = client.post("/sentiment", headers=headers, json={"reviews": [{"id": 1, "text": "Phim rất hay"}]})
        assert response.status_code == 200 and response.json()["items"][0]["label"] == "positive"
        assert client.post("/chat", headers=headers, json={"message": "x" * 1001, "today": "2026-10-27"}).status_code == 422
        assert client.post("/chat", headers=headers, json={"message": "hello", "today": "2026-10-27", "user_id": 999}).status_code == 422
        assert client.post("/sentiment", headers=headers, json={"reviews": [{"id": 1, "text": "hay"}] * 101}).status_code == 422

def test_unconfigured_service_fails_closed(monkeypatch):
    monkeypatch.delenv("AI_SERVICE_KEY", raising=False)
    with TestClient(app) as client:
        assert client.post("/sentiment", json={"reviews": []}).status_code == 503
