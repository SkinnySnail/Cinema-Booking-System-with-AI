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


def test_ambiguity_candidates_ignore_nested_titles_and_distinguish_date_choices(language):
    movies = [{"id": 1, "title": "Dune"}, {"id": 2, "title": "Dune: Part Two"}, {"id": 3, "title": "MAI"}]
    selected = language.understand("Lịch chiếu Dune: Part Two từ 12/11 đến 14/11", movies, [], "2026-11-10")
    assert selected["movie_candidates"] == [2] and not selected["ambiguous_date"]
    choices = language.understand("Lịch chiếu MAI hay Dune: Part Two ngày 12/11 hay ngày 14/11", movies, [], "2026-11-10")
    assert set(choices["movie_candidates"]) == {2, 3} and choices["ambiguous_date"]
    assert language.understand("Mai", movies, [], "2026-11-10")["ambiguous_mai"]
    assert not language.understand("Phim MAI", movies, [], "2026-11-10")["ambiguous_date"]


@pytest.mark.parametrize("phrase,min_hour,max_hour", [
    ("Tối mai", 18, None), ("toi mai", 18, None), ("tối ngày mai", 18, None),
    ("ngày mai buổi tối", 18, None), ("Đêm mai", 18, None),
    ("Sáng mai", 0, 12), ("Trưa mai", 11, 14), ("Chiều mai", 12, 18),
])
def test_tomorrow_dayparts_are_dates_not_movie_titles(language, phrase, min_hour, max_hour):
    result = language.understand(phrase + " rạp Nguyễn Du còn suất nào không? Muốn xem phim hành động nên xem phim nào",
                                 [{"id": 1, "title": "MAI"}], [{"id": 1, "name": "Galaxy Nguyễn Du"}],
                                 "2026-11-10", [{"id": 8, "name": "Hành Động"}])
    assert result["date"] == "2026-11-11" and result["date_explicit"]
    assert result["movie_id"] is None and result["reset_movie_context"]
    assert result["min_hour"] == min_hour and result["max_hour"] == max_hour
    assert result["genre_ids"] == [8] and result["cinema_id"] == 1


def test_named_mai_and_tomorrow_can_coexist(language):
    result = language.understand("Lịch chiếu phim MAI tối mai", [{"id": 1, "title": "MAI"}], [], "2026-11-10")
    assert result["movie_id"] == 1 and result["date"] == "2026-11-11" and result["min_hour"] == 18
    assert not result["reset_movie_context"]
    result = language.understand("Lịch chiếu MAI tối nay", [{"id": 1, "title": "MAI"}], [], "2026-11-10")
    assert result["movie_id"] == 1 and result["date"] == "2026-11-10" and result["min_hour"] == 18


def test_relative_daypart_rolls_year_and_respects_explicit_clock(language):
    result = language.understand("Lịch chiếu tối mai", [], [], "2026-12-31")
    assert result["date"] == "2027-01-01" and result["min_hour"] == 18
    result = language.understand("Lịch chiếu sáng mai lúc 10h", [], [], "2026-11-10")
    assert result["date"] == "2026-11-11" and result["hour"] == 10
    assert result["min_hour"] is None and result["max_hour"] is None
    result = language.understand("Lịch chiếu tối ngày kia", [], [], "2026-11-10")
    assert result["date"] == "2026-11-12" and result["min_hour"] == 18


@pytest.mark.parametrize("phrase", ["trong tuần", "cả tuần", "tuần này", "7 ngày tới", "bay ngay tiep theo", "một tuần tới"])
def test_week_requests_are_rolling_seven_day_ranges(language, phrase):
    result = language.understand("Cho tôi lịch chiếu " + phrase, [], [], "2026-11-10")
    assert result["range_requested"] and result["date_explicit"] and result["schedule_requested"]
    assert result["date_from"] == "2026-11-10" and result["date_to"] == "2026-11-16"
    assert result["reset_movie_context"]


@pytest.mark.parametrize("message,first,last", [
    ("Lịch chiếu cuối tuần", "2026-11-14", "2026-11-15"),
    ("Lịch chiếu tuần sau", "2026-11-16", "2026-11-22"),
    ("Lịch chiếu từ 12/11 đến 15/11", "2026-11-12", "2026-11-15"),
    ("Lịch chiếu 10 ngày tới", "2026-11-10", "2026-11-19"),
])
def test_requested_ranges_preserve_intent_for_server_window_enforcement(language, message, first, last):
    result = language.understand(message, [], [], "2026-11-10")
    assert result["date_from"] == first and result["date_to"] == last and result["range_requested"]


def test_week_range_uses_configured_days_and_keeps_named_movie(language):
    result = language.understand("Lịch chiếu phim MAI trong tuần", [{"id": 1, "title": "MAI"}], [], "2026-12-30", schedule_days=3)
    assert result["movie_id"] == 1 and result["date_to"] == "2027-01-01"
    assert not result["reset_movie_context"]
    result = language.understand("Lịch chiếu từ 12/11 đến 31/02", [], [], "2026-11-10")
    assert result["error"] == "Khoảng ngày không hợp lệ"

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


@pytest.mark.parametrize("message", [
    "Tối nay rạp Nguyễn Du còn suất nào không? Muốn xem phim thể loại hành động nên xem phim nào",
    "Toi nay rap Nguyen Du con suat nao khong? Muon xem phim the loai hanh dong nen xem phim nao",
])
def test_combined_recommendation_keeps_genre_cinema_and_time(language, message):
    result = language.understand(message, [], [{"id": 1, "name": "Galaxy Nguyễn Du"}],
                                 "2026-11-10", [{"id": 8, "name": "Hành Động"}])
    assert result["genre_ids"] == [8] and result["excluded_genre_ids"] == []
    assert result["schedule_requested"] and result["recommend_requested"]
    assert result["cinema_id"] == 1 and result["date"] == "2026-11-10" and result["min_hour"] == 18


def test_timed_recommendation_requests_a_matching_schedule(language):
    result = language.understand("Gợi ý phim hành động ngày mai lúc 20h", [], [], "2026-11-10",
                                 [{"id": 1, "name": "Hành Động"}])
    assert result["schedule_requested"] and result["recommend_requested"]
    assert result["genre_ids"] == [1] and result["date"] == "2026-11-11" and result["hour"] == 20


def test_genre_preferences_only_use_catalog_and_preserve_exclusions(language):
    genres = [{"id": 1, "name": "Hành Động"}, {"id": 2, "name": "Kinh Dị"}, {"id": 3, "name": "Hài"}]
    result = language.understand("Gợi ý phim hành động, không thích phim kinh dị", [], [], "2026-11-10", genres)
    assert result["genre_ids"] == [1] and result["excluded_genre_ids"] == [2]
    assert not result["schedule_requested"]
    assert language.understand("Mua hai vé", [], [], "2026-11-10", genres)["genre_ids"] == []
    assert language.understand("Gợi ý phim hài", [], [], "2026-11-10", genres)["genre_ids"] == [3]
    assert language.understand("Gợi ý phim thể loại trinh thám", [], [], "2026-11-10", genres)["genre_ids"] == []


def test_sentiment_comment_is_not_parsed_as_genre_preferences(language):
    result = language.understand("Phân tích bình luận: Tôi không thích phim hành động", [], [], "2026-11-10",
                                 [{"id": 1, "name": "Hành Động"}])
    assert result["intent"] == "sentiment" and "genre_ids" not in result


@pytest.mark.parametrize("message", [
    "Tối nay rạp Nguyễn Du còn suất nào không? Lịch chiếu nào phù hợp với cặp đôi?",
    "Toi nay rap Nguyen Du con suat nao khong? Lich chieu nao phu hop voi cap doi?",
    "Gợi ý phim để đi với người yêu ở Nguyễn Du tối nay",
])
def test_couple_request_keeps_schedule_and_uses_soft_catalog_preferences(language, message):
    genres = [{"id": 1, "name": "Hành Động"}, {"id": 3, "name": "Tình Cảm"}, {"id": 2, "name": "Hài"}]
    result = language.understand(message, [], [{"id": 1, "name": "Galaxy Nguyễn Du"}], "2026-11-10", genres)
    assert result["audience"] == "couple" and result["preferred_genre_ids"] == [3, 2]
    assert result["genre_ids"] == []  # An occasion must not become a required genre.
    assert result["recommend_requested"] and result["schedule_requested"] and result["reset_movie_context"]
    assert result["cinema_id"] == 1 and result["date"] == "2026-11-10" and result["min_hour"] == 18


def test_explicit_movie_and_followup_preserve_movie_context(language):
    movies = [{"id": 1, "title": "MAI"}]
    named = language.understand("Lịch chiếu MAI tối nay cho cặp đôi", movies, [], "2026-11-10")
    assert named["movie_id"] == 1 and not named["reset_movie_context"]
    followup = language.understand("Còn ngày mai thì sao?", movies, [], "2026-11-10")
    assert followup["movie_id"] is None and not followup["reset_movie_context"]
    general = language.understand("Tối nay rạp Nguyễn Du còn suất nào không?", movies, [], "2026-11-10")
    assert general["movie_id"] is None and general["reset_movie_context"]


def test_couple_preference_does_not_override_explicit_genres_or_exclusions(language):
    genres = [{"id": 1, "name": "Hành Động"}, {"id": 3, "name": "Tình Cảm"}, {"id": 2, "name": "Hài"}]
    result = language.understand("Gợi ý phim hành động cho cặp đôi, không thích tình cảm", [], [], "2026-11-10", genres)
    assert result["audience"] == "couple" and result["genre_ids"] == [1]
    assert result["excluded_genre_ids"] == [3] and result["preferred_genre_ids"] == [2]
    negative = language.understand("Không phải đi hẹn hò, tôi muốn xem phim hành động", [], [], "2026-11-10", genres)
    assert negative["audience"] is None and negative["preferred_genre_ids"] == []

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
        assert client.post("/chat", headers=headers, json={"message": "Lịch chiếu", "today": "2026-10-27", "schedule_days": 8}).status_code == 422
        assert client.post("/sentiment", headers=headers, json={"reviews": [{"id": 1, "text": "hay"}] * 101}).status_code == 422

def test_unconfigured_service_fails_closed(monkeypatch):
    monkeypatch.delenv("AI_SERVICE_KEY", raising=False)
    with TestClient(app) as client:
        assert client.post("/sentiment", json={"reviews": []}).status_code == 503
