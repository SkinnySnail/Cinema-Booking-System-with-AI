"""Load only locally produced, versioned ML bundles selected by the operator."""
from __future__ import annotations

import hashlib
import json
from pathlib import Path

import joblib
import numpy as np
import sklearn


class ModelBundle:
    def __init__(self, directory: str | Path):
        root = Path(directory).resolve(strict=True)
        manifest = json.loads((root / "manifest.json").read_text(encoding="utf-8"))
        if manifest.get("schema_version") != 1:
            raise ValueError("Unsupported AI bundle schema")
        if manifest.get("feature_contract") != "cinema-ml-v1":
            raise ValueError("Incompatible AI feature contract")
        if manifest.get("sklearn_version") != sklearn.__version__:
            raise ValueError("AI bundle requires the same scikit-learn version as serving")
        if manifest.get("numpy_version") != np.__version__ or manifest.get("joblib_version") != joblib.__version__:
            raise ValueError("AI bundle requires matching NumPy and joblib versions")
        self.models = {}
        self.metadata = {}
        for task, entry in manifest["artifacts"].items():
            path = (root / entry["file"]).resolve(strict=True)
            if path.parent != root or path.stat().st_size > 256 * 1024 * 1024:
                raise ValueError("Invalid bundle artifact path or size")
            digest = hashlib.sha256(path.read_bytes()).hexdigest()
            if digest != entry["sha256"]:
                raise ValueError(f"Corrupt AI artifact: {task}")
            # joblib is executable serialization. Only load bundles you produced/trust.
            self.models[task] = joblib.load(path)
            self.metadata[task] = entry["metadata"]
        self.identifier = manifest["bundle_id"]

    def get(self, task):
        return self.models.get(task)

    def status(self):
        return {"bundle_id": self.identifier, "tasks": sorted(self.models)}
