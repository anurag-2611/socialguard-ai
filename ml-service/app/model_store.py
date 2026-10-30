"""Loading a versioned model bundle with an integrity check."""

from __future__ import annotations

import hashlib
import json
from dataclasses import dataclass
from pathlib import Path
from typing import Any

import joblib
from sklearn.pipeline import Pipeline


class ModelLoadError(RuntimeError):
    pass


@dataclass(frozen=True)
class LoadedModel:
    pipeline: Pipeline
    metadata: dict[str, Any]
    metrics: dict[str, Any]
    feature_schema: dict[str, Any]


def load_model(model_dir: Path) -> LoadedModel:
    """Load model.joblib after verifying its SHA-256 against metadata.json.

    joblib files are pickles: never load one whose provenance you cannot verify.
    """
    try:
        metadata = json.loads((model_dir / "metadata.json").read_text())
        metrics = json.loads((model_dir / "metrics.json").read_text())
        feature_schema = json.loads((model_dir / "feature_schema.json").read_text())
        model_path = model_dir / "model.joblib"
        actual = hashlib.sha256(model_path.read_bytes()).hexdigest()
    except (OSError, json.JSONDecodeError) as exc:
        raise ModelLoadError(f"cannot read model bundle in {model_dir}: {exc}") from exc

    if actual != metadata.get("model_sha256"):
        raise ModelLoadError("model.joblib checksum does not match metadata.json; refusing to load")

    pipeline = joblib.load(model_path)
    return LoadedModel(pipeline, metadata, metrics, feature_schema)
