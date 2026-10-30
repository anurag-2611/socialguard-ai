"""Train the Logistic Regression baseline and write a versioned model bundle.

    python -m training.train --dataset synthetic_v1 --version v1

Design rules
  * ONE sklearn Pipeline (feature engineering -> impute+scale -> LogisticRegression) is saved, so
    serving applies exactly the training-time preprocessing.
  * class_weight is decided by a measured experiment (see select_class_weight), not assumed.
  * Thresholds are suggested from the VALIDATION split only; the TEST split is evaluated once.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import platform
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

import joblib
import numpy as np
import pandas as pd
import sklearn
from numpy.typing import NDArray
from sklearn.compose import ColumnTransformer
from sklearn.impute import SimpleImputer
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import average_precision_score, brier_score_loss, precision_recall_curve
from sklearn.model_selection import GridSearchCV, StratifiedKFold
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import FunctionTransformer, StandardScaler

from app.features import (
    FEATURE_COLUMNS,
    FEATURE_LABELS,
    FEATURE_SCHEMA_VERSION,
    PROMO_KEYWORDS,
    RAW_COLUMNS,
    engineer_features,
)
from training.common import (
    LABEL_COLUMN,
    MODELS_DIR,
    SPLIT_SEED,
    load_dataset,
    split_dataset,
    validate_schema,
)
from training.metrics import evaluate

MODEL_NAME = "logreg-baseline"
C_GRID = [0.01, 0.03, 0.1, 0.3, 1.0, 3.0, 10.0]
PRECISION_TARGET_HIGH = 0.90  # HIGH band: be right 9 times out of 10 before escalating
RECALL_TARGET_LOW = 0.90  # below LOW band we should miss at most 10% of suspicious profiles
PR_AUC_TIE = 0.005


def build_pipeline(c: float = 1.0, class_weight: str | None = None) -> Pipeline:
    numeric = Pipeline(
        [
            # add_indicator -> explicit "was unavailable" columns; nothing is silently invented.
            ("impute", SimpleImputer(strategy="median", add_indicator=True)),
            ("scale", StandardScaler()),
        ]
    )
    return Pipeline(
        [
            ("engineer", FunctionTransformer(engineer_features, validate=False)),
            ("prep", ColumnTransformer([("num", numeric, FEATURE_COLUMNS)], remainder="drop")),
            (
                "clf",
                LogisticRegression(
                    C=c,
                    solver="lbfgs",
                    max_iter=2000,
                    class_weight=class_weight,
                    random_state=SPLIT_SEED,
                ),
            ),
        ]
    )


def _fit_candidate(
    x: pd.DataFrame, y: NDArray[np.int_], class_weight: str | None, seed: int
) -> GridSearchCV:
    search = GridSearchCV(
        build_pipeline(class_weight=class_weight),
        param_grid={"clf__C": C_GRID},
        scoring="average_precision",
        cv=StratifiedKFold(n_splits=5, shuffle=True, random_state=seed),
        n_jobs=-1,
        refit=True,
    )
    return search.fit(x, y)


def select_class_weight(
    candidates: dict[str, GridSearchCV],
    x_val: pd.DataFrame,
    y_val: NDArray[np.int_],
) -> tuple[str, dict[str, Any]]:
    """Pick by validation PR-AUC; if within PR_AUC_TIE, prefer the better-calibrated (Brier)."""
    report: dict[str, Any] = {}
    for key, search in candidates.items():
        proba = search.predict_proba(x_val)[:, 1]
        report[key] = {
            "best_C": float(search.best_params_["clf__C"]),
            "cv_pr_auc": float(search.best_score_),
            "val_pr_auc": float(average_precision_score(y_val, proba)),
            "val_brier": float(brier_score_loss(y_val, proba)),
        }
    keys = list(report)
    best = max(keys, key=lambda k: report[k]["val_pr_auc"])
    for other in keys:
        close = abs(report[other]["val_pr_auc"] - report[best]["val_pr_auc"]) <= PR_AUC_TIE
        if close and report[other]["val_brier"] < report[best]["val_brier"]:
            best = other
    report["selected"] = best
    report["rule"] = (
        f"highest validation PR-AUC; if within {PR_AUC_TIE}, the lower Brier score "
        "(better-calibrated probabilities, which the risk bands consume)"
    )
    return best, report


def suggest_thresholds(y_val: NDArray[np.int_], proba_val: NDArray[np.float64]) -> dict[str, Any]:
    precision, recall, thresholds = precision_recall_curve(y_val, proba_val)
    precision, recall = precision[:-1], recall[:-1]  # align with thresholds
    high = thresholds[precision >= PRECISION_TARGET_HIGH]
    low = thresholds[recall >= RECALL_TARGET_LOW]
    return {
        "basis": "validation split only",
        "high_threshold": float(high.min()) if len(high) else None,
        "high_rule": f"smallest threshold with validation precision >= {PRECISION_TARGET_HIGH}",
        "low_threshold": float(low.max()) if len(low) else None,
        "low_rule": f"largest threshold with validation recall >= {RECALL_TARGET_LOW}",
        "note": "Suggestions only. Configured bands (0.30/0.70) are prototype defaults.",
    }


def coefficient_table(pipeline: Pipeline) -> list[dict[str, Any]]:
    prep: ColumnTransformer = pipeline.named_steps["prep"]
    clf: LogisticRegression = pipeline.named_steps["clf"]
    names = [str(n).removeprefix("num__") for n in prep.get_feature_names_out()]
    rows = [
        {"feature": n, "coefficient": float(c)} for n, c in zip(names, clf.coef_[0], strict=True)
    ]
    return sorted(rows, key=lambda r: abs(r["coefficient"]), reverse=True)


def train_model(
    frame: pd.DataFrame,
    dataset_meta: dict[str, Any],
    version: str = "v1",
    seed: int = SPLIT_SEED,
    output_dir: Path | None = None,
) -> dict[str, Any]:
    validate_schema(frame)
    train, validation, test = split_dataset(frame, seed)

    def xy(part: pd.DataFrame) -> tuple[pd.DataFrame, NDArray[np.int_]]:
        return part[RAW_COLUMNS], part[LABEL_COLUMN].to_numpy(dtype=int)

    x_tr, y_tr = xy(train)
    x_val, y_val = xy(validation)
    x_te, y_te = xy(test)

    candidates = {"none": _fit_candidate(x_tr, y_tr, None, seed),
                  "balanced": _fit_candidate(x_tr, y_tr, "balanced", seed)}
    selected, experiment = select_class_weight(candidates, x_val, y_val)
    pipeline: Pipeline = candidates[selected].best_estimator_

    proba_val = pipeline.predict_proba(x_val)[:, 1]
    suggested = suggest_thresholds(y_val, proba_val)
    extra = tuple(t for t in (suggested["high_threshold"], suggested["low_threshold"]) if t)

    metrics = {
        "validation": evaluate(y_val, proba_val, extra, with_ci=False),
        "test": evaluate(y_te, pipeline.predict_proba(x_te)[:, 1], extra),
        "class_weight_experiment": experiment,
        "suggested_thresholds": suggested,
        "coefficients": coefficient_table(pipeline),
        "split": {"train": len(train), "validation": len(validation), "test": len(test)},
        "caveat": (
            "Computed on SYNTHETIC data written by the project author. These numbers show the "
            "pipeline works; they are not evidence of real-world detection performance."
            if dataset_meta.get("dataset_kind") == "SYNTHETIC"
            else "Computed on the dataset described in metadata.json."
        ),
    }
    metadata = {
        "model_name": MODEL_NAME,
        "model_version": version,
        "dataset_version": dataset_meta["dataset_version"],
        "dataset_kind": dataset_meta.get("dataset_kind", "UNKNOWN"),
        "feature_schema_version": FEATURE_SCHEMA_VERSION,
        "algorithm": "LogisticRegression (L2 default, lbfgs)",
        "class_weight": None if selected == "none" else selected,
        "C": experiment[selected]["best_C"],
        "seed": seed,
        "trained_at": datetime.now(UTC).isoformat(),
        "sklearn_version": sklearn.__version__,
        "python_version": platform.python_version(),
        "label_semantics": {"0": "likely genuine", "1": "suspicious/fake"},
    }
    feature_schema = {
        "feature_schema_version": FEATURE_SCHEMA_VERSION,
        "raw_columns": RAW_COLUMNS,
        "feature_columns": FEATURE_COLUMNS,
        "feature_labels": FEATURE_LABELS,
        "promo_keywords": list(PROMO_KEYWORDS),
        "missing_value_policy": "unavailable -> NaN -> median impute + explicit indicator column",
    }

    if output_dir is not None:
        output_dir.mkdir(parents=True, exist_ok=False)
        model_path = output_dir / "model.joblib"
        joblib.dump(pipeline, model_path)
        metadata["model_sha256"] = hashlib.sha256(model_path.read_bytes()).hexdigest()
        (output_dir / "metrics.json").write_text(json.dumps(metrics, indent=2))
        (output_dir / "metadata.json").write_text(json.dumps(metadata, indent=2))
        (output_dir / "feature_schema.json").write_text(json.dumps(feature_schema, indent=2))

    return {"pipeline": pipeline, "metrics": metrics, "metadata": metadata}


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--dataset", default="synthetic_v1")
    parser.add_argument("--version", default="v1")
    parser.add_argument("--out", type=Path, default=MODELS_DIR)
    args = parser.parse_args()

    frame, meta = load_dataset(args.dataset)
    result = train_model(frame, meta, args.version, output_dir=args.out / args.version)
    test = result["metrics"]["test"]
    print(f"Saved {args.out / args.version}")
    print(f"class_weight selected: {result['metadata']['class_weight']}")
    print(f"TEST  ROC-AUC {test['roc_auc']:.3f}  PR-AUC {test['pr_auc']:.3f}  "
          f"Brier {test['brier_score']:.3f}")
    for row in test["at_thresholds"]:
        print(f"  thr {row['threshold']:.2f}: precision {row['precision']:.3f} "
              f"recall {row['recall']:.3f} f1 {row['f1']:.3f}")


if __name__ == "__main__":
    main()
