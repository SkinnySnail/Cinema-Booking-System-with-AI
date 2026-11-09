"""Use a frozen local Ollama encoder with the matching trained classification head."""
from __future__ import annotations

from collections import OrderedDict
import json
import os
from threading import Lock
from time import monotonic
from urllib.error import URLError
from urllib.parse import urlsplit
from urllib.request import HTTPRedirectHandler, ProxyHandler, Request, build_opener

import numpy as np


class OllamaUnavailable(RuntimeError):
    pass


class NoRedirect(HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None


class OllamaEmbeddings:
    def __init__(self, spec):
        self.model = spec["model"]
        self.digest = spec["digest"]
        self.dimension = int(spec["dimension"])
        self.context = int(spec["context"])
        self.url = os.getenv("AI_OLLAMA_URL", "http://127.0.0.1:11434").rstrip("/")
        endpoint = urlsplit(self.url)
        if (endpoint.scheme != "http" or endpoint.hostname not in {"localhost", "127.0.0.1", "::1", "host.docker.internal"}
                or endpoint.username or endpoint.password or endpoint.path or endpoint.query or endpoint.fragment):
            raise ValueError("AI_OLLAMA_URL must point to the local Ollama server")
        self.opener = build_opener(ProxyHandler({}), NoRedirect())
        self.catalog_cache = OrderedDict()
        self.cache_lock = Lock()

    def request(self, path, deadline, payload=None):
        time_left = deadline - monotonic()
        if time_left <= 0:
            raise OllamaUnavailable("Ollama request exceeded its time budget")
        body = json.dumps(payload, ensure_ascii=False).encode() if payload is not None else None
        request = Request(self.url + path, data=body, headers={"Content-Type": "application/json"})
        try:
            with self.opener.open(request, timeout=time_left) as response:
                return json.load(response)
        except (URLError, OSError, ValueError) as error:
            raise OllamaUnavailable("Local Ollama request failed") from error

    def encode(self, texts, *, catalog=False):
        deadline = monotonic() + 9
        tags = self.request("/api/tags", deadline).get("models", [])
        if not any(entry.get("name") == self.model and entry.get("digest") == self.digest for entry in tags):
            raise OllamaUnavailable("The installed Ollama model does not match the trained artifact")

        with self.cache_lock:
            vectors = {text: self.catalog_cache[text] for text in texts if catalog and text in self.catalog_cache}
        missing = list(dict.fromkeys(text for text in texts if text not in vectors))
        for start in range(0, len(missing), 32):
            batch = missing[start:start + 32]
            result = self.request("/api/embed", deadline, {
                "model": self.model, "input": batch, "keep_alive": "10m",
                "options": {"num_ctx": self.context},
            })
            try:
                encoded = np.asarray(result["embeddings"], dtype=np.float32)
            except (KeyError, TypeError, ValueError) as error:
                raise OllamaUnavailable("Invalid Ollama embedding response") from error
            if encoded.shape != (len(batch), self.dimension) or not np.isfinite(encoded).all():
                raise OllamaUnavailable("Unexpected Ollama embedding shape or values")
            vectors.update(zip(batch, encoded))
            if catalog:
                with self.cache_lock:
                    self.catalog_cache.update(zip(batch, encoded))
                    while len(self.catalog_cache) > 1000:
                        self.catalog_cache.popitem(last=False)
        return np.asarray([vectors[text] for text in texts], dtype=np.float32)


class OllamaClassifier:
    def __init__(self, estimator, spec):
        self.encoder = OllamaEmbeddings(spec)
        self.estimator = estimator
        self.classes_ = estimator.classes_
        if estimator.n_features_in_ != self.encoder.dimension:
            raise ValueError("Classification head and Ollama encoder dimensions differ")
        self.name = f"ollama/{self.encoder.model}+logistic-regression"

    def predict_proba(self, texts):
        return self.estimator.predict_proba(self.encoder.encode(texts))
