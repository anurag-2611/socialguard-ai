from __future__ import annotations

from pathlib import Path
from typing import Any

import pytest

from training.common import load_dataset  # noqa: F401  (ensures package import path works)
from training.generate_dataset import generate
from training.train import train_model

SAMPLE_PROFILE: dict[str, Any] = {
    "username": "acmebank_official1",
    "official_username": "acmebank",
    "account_age_days": 9,
    "followers": 35,
    "following": 1200,
    "posts": 400,
    "bio": "official account giveaway dm to claim crypto",
    "has_profile_image": True,
    "external_link_present": True,
    "image_similarity": 0.91,
}


@pytest.fixture(scope="session")
def trained(tmp_path_factory: pytest.TempPathFactory) -> dict[str, Any]:
    """Train a small real model once per test session (about a few seconds)."""
    frame = generate(n=2500, prevalence=0.2, seed=1, profile="default")
    meta = {"dataset_version": "test_ds", "dataset_kind": "SYNTHETIC"}
    out = tmp_path_factory.mktemp("models") / "v-test"
    result = train_model(frame, meta, version="v-test", output_dir=out)
    result["dir"] = out
    result["frame"] = frame
    return result


@pytest.fixture()
def model_dir(trained: dict[str, Any]) -> Path:
    path: Path = trained["dir"]
    return path
