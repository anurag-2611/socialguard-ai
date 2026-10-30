"""Validate a labeled CSV and register it so train.py can use it.

    python -m training.register_dataset --csv my_labels.csv --name labeled_v1 \
        --kind REAL_AUTHORIZED --source "Analyst-reviewed profiles, Jan-Mar 2027" --license "internal"

Required columns: username, label (0 = likely genuine, 1 = suspicious/fake).
Every other schema column is optional; leave it empty (or omit the column) when the value was
not available. Unavailable stays unavailable: nothing is filled in for you.
"""

from __future__ import annotations

import argparse
import json
from datetime import UTC, datetime

import pandas as pd

from app.features import RAW_COLUMNS
from training.common import DATA_DIR, LABEL_COLUMN, dataset_paths, validate_schema

KINDS = ("REAL_AUTHORIZED", "PUBLIC_RESEARCH", "MANUAL_LABELED", "SYNTHETIC")
MIN_ROWS_WARN = 1000
MIN_MINORITY_WARN = 100


def inspect(frame: pd.DataFrame) -> tuple[pd.DataFrame, list[str], list[str]]:
    """Return (frame with all schema columns, problems that block, warnings)."""
    errors: list[str] = []
    warnings: list[str] = []
    for required in ("username", LABEL_COLUMN):
        if required not in frame.columns:
            errors.append(f"missing required column '{required}'")
    if errors:
        return frame, errors, warnings

    absent = [c for c in RAW_COLUMNS if c not in frame.columns]
    for column in absent:
        frame[column] = None
    if absent:
        warnings.append(f"columns not provided, treated as UNAVAILABLE: {absent}")

    try:
        validate_schema(frame)
    except ValueError as exc:
        errors.append(str(exc))
        return frame, errors, warnings

    counts = frame[LABEL_COLUMN].value_counts()
    if len(frame) < MIN_ROWS_WARN:
        warnings.append(f"only {len(frame)} rows; metrics will be very noisy (aim for thousands)")
    if int(counts.min()) < MIN_MINORITY_WARN:
        warnings.append(f"minority class has {int(counts.min())} rows; recall estimates unreliable")
    duplicates = int(frame.duplicated(subset=["username"]).sum())
    if duplicates:
        warnings.append(f"{duplicates} duplicate usernames; duplicates across splits inflate scores")
    empty = [c for c in RAW_COLUMNS if frame[c].isna().all()]
    if empty:
        warnings.append(f"columns entirely empty (model learns nothing from them): {empty}")
    return frame, errors, warnings


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--csv", required=True)
    parser.add_argument("--name", required=True)
    parser.add_argument("--kind", choices=KINDS, required=True)
    parser.add_argument("--source", required=True, help="where the data came from")
    parser.add_argument("--license", required=True, help="terms it may be used under")
    args = parser.parse_args()

    csv_path, meta_path = dataset_paths(args.name)
    if csv_path.exists():
        raise SystemExit(f"dataset '{args.name}' already exists; choose a new name")

    frame, errors, warnings = inspect(pd.read_csv(args.csv))
    for message in warnings:
        print(f"WARNING: {message}")
    if errors:
        raise SystemExit("INVALID: " + "; ".join(errors))

    DATA_DIR.mkdir(parents=True, exist_ok=True)
    frame[[*RAW_COLUMNS, LABEL_COLUMN]].to_csv(csv_path, index=False)
    meta = {
        "dataset_version": args.name,
        "dataset_kind": args.kind,
        "source": args.source,
        "license": args.license,
        "rows": len(frame),
        "label_prevalence": float(frame[LABEL_COLUMN].mean()),
        "warnings": warnings,
        "created_at": datetime.now(UTC).isoformat(),
    }
    meta_path.write_text(json.dumps(meta, indent=2))
    print(f"Registered {args.name}: {len(frame)} rows, prevalence {meta['label_prevalence']:.3f}")
    print(f"Next: python -m training.train --dataset {args.name} --version v2")


if __name__ == "__main__":
    main()
