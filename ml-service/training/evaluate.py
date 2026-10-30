"""Evaluate a saved model on a dataset's held-out test split, or on a shifted dataset.

    python -m training.evaluate --version v1 --dataset synthetic_v1      # same distribution
    python -m training.evaluate --version v1 --dataset synthetic_shift   # distribution shift
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path

from app.features import RAW_COLUMNS
from app.model_store import load_model
from training.common import (
    LABEL_COLUMN,
    MODELS_DIR,
    load_dataset,
    split_dataset,
    validate_schema,
)
from training.metrics import evaluate


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--version", default="v1")
    parser.add_argument("--dataset", default="synthetic_v1")
    parser.add_argument("--models", type=Path, default=MODELS_DIR)
    args = parser.parse_args()

    model = load_model(args.models / args.version)
    frame, meta = load_dataset(args.dataset)
    validate_schema(frame)
    trained_on = model.metadata["dataset_version"]
    # Same dataset as training -> only the held-out test split. Otherwise the whole dataset is new.
    part = split_dataset(frame)[2] if args.dataset == trained_on else frame
    scope = "held-out test split" if args.dataset == trained_on else "entire (unseen) dataset"

    proba = model.pipeline.predict_proba(part[RAW_COLUMNS])[:, 1]
    result = evaluate(part[LABEL_COLUMN].to_numpy(dtype=int), proba)
    result.update({"model_version": args.version, "trained_on": trained_on,
                   "evaluated_on": args.dataset, "scope": scope,
                   "dataset_kind": meta.get("dataset_kind")})

    out = args.models / args.version / f"evaluation_{args.dataset}.json"
    out.write_text(json.dumps(result, indent=2))
    print(f"{args.version} trained on {trained_on}, evaluated on {args.dataset} ({scope})")
    print(f"  ROC-AUC {result['roc_auc']:.3f} {result['roc_auc_95ci']}")
    print(f"  PR-AUC  {result['pr_auc']:.3f} {result['pr_auc_95ci']}  Brier {result['brier_score']:.3f}")
    for row in result["at_thresholds"]:
        cm = row["confusion_matrix"]
        print(f"  thr {row['threshold']:.2f}: P {row['precision']:.3f} R {row['recall']:.3f} "
              f"F1 {row['f1']:.3f}  FP {cm['fp']} FN {cm['fn']}")
    print(f"Wrote {out}")


if __name__ == "__main__":
    main()
