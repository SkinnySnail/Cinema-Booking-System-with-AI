import hmac
import os
from contextlib import asynccontextmanager
from typing import Annotated

from fastapi import Depends, FastAPI, Header, HTTPException
from pydantic import BaseModel, ConfigDict, Field

from engine import LanguageModels, forecast, recommend

models: LanguageModels | None = None


@asynccontextmanager
async def lifespan(app):
    global models
    models = LanguageModels()
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
    today: str


class ReviewText(Payload):
    id: int
    text: str = Field(max_length=5000)


class SentimentRequest(Payload):
    reviews: list[ReviewText] = Field(max_length=100)


class ForecastRequest(Payload):
    history: list[dict] = Field(default_factory=list, max_length=10000)
    candidates: list[dict] = Field(default_factory=list, max_length=30000)


@app.get("/health")
def health():
    return {"status": "ok", "model_ready": models is not None, "version": 1}


@app.post("/recommendations", dependencies=[Depends(internal_access)])
def recommendations(payload: RecommendationRequest):
    return recommend(payload.model_dump())


@app.post("/chat", dependencies=[Depends(internal_access)])
def chat(payload: ChatRequest):
    return models.understand(payload.message, payload.movies, payload.cinemas, payload.today)


@app.post("/sentiment", dependencies=[Depends(internal_access)])
def sentiment(payload: SentimentRequest):
    return models.analyze_sentiment([r.model_dump() for r in payload.reviews])


@app.post("/forecast", dependencies=[Depends(internal_access)])
def demand_forecast(payload: ForecastRequest):
    return forecast(payload.model_dump())
