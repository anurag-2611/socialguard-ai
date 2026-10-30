import json
from pathlib import Path
from typing import Any

import joblib
import numpy as np
import pandas as pd
import pytest

from app.explain import explain_row
from app.features import RAW_COLUMNS
from app.model_store import ModelLoadError, load_model
from tests.conftest import SAMPLE_PROFILE
from training.common import LABEL_COLUMN, split_dataset


def test_split_is_stratified_disjoint_and_deterministic(trained: dict[str, Any]) -> None:
    frame: pd.DataFrame = trained["frame"]
    a = split_dataset(frame)
    b = split_dataset(frame)
    assert all(x.index.equals(y.index) for x, y in zip(a, b, strict=True))
    train, val, test = a
    assert not (set(train.index) & set(val.index)) and not (set(val.index) & set(test.index))
    assert len(train) + len(val) + len(test) == len(frame)
    rates = [p[LABEL_COLUMN].mean() for p in a]
    assert max(rates) - min(rates) < 0.02


def test_bundle_contains_all_artifacts(model_dir: Path) -> None:
    for name in ("model.joblib", "metrics.json", "metadata.json", "feature_schema.json"):
        assert (model_dir / name).exists()
    meta = json.loads((model_dir / "metadata.json").read_text())
    assert meta["feature_schema_version"] == "fs-1"
    assert meta["dataset_kind"] == "SYNTHETIC"
    assert len(meta["model_sha256"]) == 64


def test_metrics_are_beyond_accuracy_and_better_than_chance(trained: dict[str, Any]) -> None:
    test = trained["metrics"]["test"]
    assert test["roc_auc"] > 0.8 and test["pr_auc"] > test["positive_rate"]
    for key in ("brier_score", "calibration", "roc_auc_95ci", "pr_auc_95ci", "at_thresholds"):
        assert key in test
    assert "SYNTHETIC" in trained["metrics"]["caveat"]


def test_probabilities_are_valid(trained: dict[str, Any]) -> None:
    proba = trained["pipeline"].predict_proba(trained["frame"][RAW_COLUMNS].head(200))[:, 1]
    assert np.all((proba >= 0) & (proba <= 1))


def test_loaded_model_matches_in_memory_model(trained: dict[str, Any], model_dir: Path) -> None:
    raw = trained["frame"][RAW_COLUMNS].head(50)
    loaded = load_model(model_dir)
    np.testing.assert_allclose(
        loaded.pipeline.predict_proba(raw), trained["pipeline"].predict_proba(raw)
    )


def test_explanation_is_exactly_additive(trained: dict[str, Any]) -> None:
    """intercept + sum(contributions) must reproduce the model's own probability."""
    pipeline = trained["pipeline"]
    for row in (pd.DataFrame([SAMPLE_PROFILE]), pd.DataFrame([{"username": "plainname"}])):
        explanation = explain_row(pipeline, row)
        expected = float(pipeline.predict_proba(row)[0, 1])
        assert explanation.probability == pytest.approx(expected, abs=1e-9)


def test_unavailable_features_are_reported_as_such(trained: dict[str, Any]) -> None:
    explanation = explain_row(trained["pipeline"], pd.DataFrame([{"username": "plainname"}]))
    by_name = {t.feature: t for t in explanation.terms}
    assert np.isnan(by_name["log_followers"].value)


def test_tampered_model_is_refused(trained: dict[str, Any], tmp_path: Path) -> None:
    target = tmp_path / "tampered"
    target.mkdir()
    for name in ("metrics.json", "metadata.json", "feature_schema.json"):
        (target / name).write_text((trained["dir"] / name).read_text())
    joblib.dump({"not": "the model"}, target / "model.joblib")
    with pytest.raises(ModelLoadError, match="checksum"):
        load_model(target)


def test_missing_bundle_raises_clear_error(tmp_path: Path) -> None:
    with pytest.raises(ModelLoadError):
        load_model(tmp_path / "nope")
