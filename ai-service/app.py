import hmac
import os
from contextlib import asynccontextmanager
from typing import Annotated

from fastapi import Depends, FastAPI, Header, HTTPException
from pydantic import BaseModel, ConfigDict, Field

from engine import LanguageModels, forecast, recommend
from model_bundle import ModelBundle
from ollama_adapter import OllamaEmbeddings, OllamaUnavailable

models: LanguageModels | None = None
bundle: ModelBundle | None = None
movie_encoder: OllamaEmbeddings | None = None


@asynccontextmanager
async def lifespan(app):
    global models, bundle, movie_encoder
    directory = os.getenv("AI_MODEL_DIR")
    bundle = ModelBundle(directory) if directory else None
    models = LanguageModels(bundle)
    tuning = bundle.get("recommendation") if bundle else None
    movie_encoder = OllamaEmbeddings(tuning["ollama"]) if tuning and "ollama" in tuning else None
    yield


app = FastAPI(title="Galaxy Cinema AI", lifespan=lifespan, docs_url=None, redoc_url=None)


def internal_access(x_ai_key: Annotated[str | None, Header()] = None):
    key = os.getenv("AI_SERVICE_KEY", "")
    if not key:
        raise HTTPException(503, "Service credential not configured")
    if not key or not hmac.compare_digest(x_ai_key or "", key):
        raise HTTPException(401, "Invalid service credential")


class Payload(BaseModel):
    model_config = ConfigDict(extra="forbid")


class RecommendationRequest(Payload):
    movies: list[dict] = Field(max_length=500)
    interactions: list[dict] = Field(default_factory=list, max_length=10000)
    concessions: list[dict] = Field(default_factory=list, max_length=200)
    user_id: int = 0
    movie_id: int = 0
    limit: int = Field(default=6, ge=1, le=12)


class ChatRequest(Payload):
    message: str = Field(min_length=1, max_length=1000)
    movies: list[dict] = Field(default_factory=list, max_length=500)
    cinemas: list[dict] = Field(default_factory=list, max_length=200)
    genres: list[dict] = Field(default_factory=list, max_length=200)
    today: str
    schedule_days: int = Field(default=7, ge=1, le=7)


class ReviewText(Payload):
    id: int
    text: str = Field(max_length=5000)


class SentimentRequest(Payload):
    reviews: list[ReviewText] = Field(max_length=100)


class ForecastRequest(Payload):
    cinema_id: int = Field(default=0, ge=0)
    history: list[dict] = Field(default_factory=list, max_length=10000)
    candidates: list[dict] = Field(default_factory=list, max_length=30000)


@app.get("/health")
def health():
    return {"status": "ok", "model_ready": models is not None, "version": 1,
            "models": bundle.status() if bundle else {"bundle_id": None, "tasks": []}}


@app.post("/recommendations", dependencies=[Depends(internal_access)])
def recommendations(payload: RecommendationRequest):
    tuning = bundle.get("recommendation") if bundle else None
    data = payload.model_dump()
    if movie_encoder and payload.movies and (payload.movie_id or (payload.user_id and any(
        int(event["user_id"]) == payload.user_id for event in payload.interactions
    ))):
        # Match the title + genres representation used to tune the ranking weights.
        texts = [f"{movie.get('title') or ''} {movie.get('genres') or ''}" for movie in payload.movies]
        try:
            vectors = movie_encoder.encode(texts, catalog=True)
        except OllamaUnavailable:
            result = recommend(data)
            result["model"] = "hybrid-tfidf-collaborative-svd-fallback"
            return result
        result = recommend(data, tuning, vectors)
        result["model"] = f"ollama/{movie_encoder.model}+hybrid-svd"
        return result
    result = recommend(data, tuning)
    if result["mode"] == "cold_start":
        result["model"] = "popularity"
    return result


@app.post("/chat", dependencies=[Depends(internal_access)])
def chat(payload: ChatRequest):
    return models.understand(payload.message, payload.movies, payload.cinemas, payload.today, payload.genres, payload.schedule_days)


@app.post("/sentiment", dependencies=[Depends(internal_access)])
def sentiment(payload: SentimentRequest):
    return models.analyze_sentiment([r.model_dump() for r in payload.reviews])


@app.post("/forecast", dependencies=[Depends(internal_access)])
def demand_forecast(payload: ForecastRequest):
    trained = bundle.get(f"forecast:{payload.cinema_id}") if bundle else None
    return forecast(payload.model_dump(), trained)
