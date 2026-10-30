"""Paths, dataset loading and the deterministic train/validation/test split."""

from __future__ import annotations

import json
import os
from pathlib import Path
from typing import Any

import pandas as pd
from sklearn.model_selection import train_test_split

ROOT = Path(__file__).resolve().parents[1]  # the ml-service folder
DATA_DIR = Path(os.environ.get("ML_DATA_DIR", ROOT / "data"))
MODELS_DIR = Path(os.environ.get("ML_MODELS_DIR", ROOT / "models"))

LABEL_COLUMN = "label"  # 0 = likely genuine, 1 = suspicious/fake
SPLIT_SEED = 42


def dataset_paths(name: str) -> tuple[Path, Path]:
    return DATA_DIR / f"{name}.csv", DATA_DIR / f"{name}.meta.json"


def load_dataset(name: str) -> tuple[pd.DataFrame, dict[str, Any]]:
    csv_path, meta_path = dataset_paths(name)
    if not csv_path.exists() or not meta_path.exists():
        raise FileNotFoundError(
            f"Dataset '{name}' not found in {DATA_DIR}. "
            f"Run: python -m training.generate_dataset --name {name}"
        )
    frame = pd.read_csv(csv_path)
    meta: dict[str, Any] = json.loads(meta_path.read_text())
    return frame, meta


def validate_schema(frame: pd.DataFrame) -> None:
    """Fail fast on structural problems before any training happens."""
    from app.features import RAW_COLUMNS

    missing = [c for c in [*RAW_COLUMNS, LABEL_COLUMN] if c not in frame.columns]
    if missing:
        raise ValueError(f"Dataset is missing columns: {missing}")
    if not set(frame[LABEL_COLUMN].dropna().unique()) <= {0, 1}:
        raise ValueError("label must contain only 0 (genuine) and 1 (suspicious)")
    if frame[LABEL_COLUMN].isna().any():
        raise ValueError("label contains missing values")
    if frame["username"].isna().any():
        raise ValueError("username is required for every record")
    if frame[LABEL_COLUMN].nunique() < 2:
        raise ValueError("dataset needs both classes")


def split_dataset(
    frame: pd.DataFrame, seed: int = SPLIT_SEED
) -> tuple[pd.DataFrame, pd.DataFrame, pd.DataFrame]:
    """Stratified 70/15/15 train/validation/test split, identical on every call."""
    train, rest = train_test_split(
        frame, test_size=0.30, stratify=frame[LABEL_COLUMN], random_state=seed
    )
    validation, test = train_test_split(
        rest, test_size=0.50, stratify=rest[LABEL_COLUMN], random_state=seed
    )
    return train, validation, test
