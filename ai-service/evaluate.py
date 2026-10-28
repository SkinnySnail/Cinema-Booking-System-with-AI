"""Reproducible cross-validation on the small seed corpus; not a production metric."""
import csv
import json
from pathlib import Path
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.linear_model import LogisticRegression
from sklearn.model_selection import StratifiedKFold, cross_validate
from sklearn.pipeline import make_pipeline

rows = list(csv.DictReader((Path(__file__).parent / "data/sentiment.csv").open(encoding="utf-8")))
model = make_pipeline(TfidfVectorizer(ngram_range=(1, 2), strip_accents="unicode"),
                      LogisticRegression(C=5, class_weight="balanced", max_iter=600, random_state=7))
scores = cross_validate(model, [r["text"] for r in rows], [r["label"] for r in rows],
                        cv=StratifiedKFold(n_splits=4, shuffle=True, random_state=7),
                        scoring=["accuracy", "f1_macro"])
print(json.dumps({"dataset": "handwritten bootstrap corpus", "samples": len(rows), "folds": 4,
                  "accuracy": round(float(scores["test_accuracy"].mean()), 4),
                  "macro_f1": round(float(scores["test_f1_macro"].mean()), 4),
                  "limitation": "Small synthetic seed corpus; requires independent real Vietnamese reviews before production."}, indent=2))
