"""Evaluation helpers. Accuracy is deliberately NOT a headline metric (class imbalance)."""

from __future__ import annotations

from typing import Any

import numpy as np
from numpy.typing import NDArray
from sklearn.calibration import calibration_curve
from sklearn.metrics import (
    average_precision_score,
    brier_score_loss,
    confusion_matrix,
    precision_recall_fscore_support,
    roc_auc_score,
)

FloatArray = NDArray[np.float64]
IntArray = NDArray[np.int_]

REPORT_THRESHOLDS = (0.30, 0.50, 0.70)


def at_threshold(y_true: IntArray, proba: FloatArray, threshold: float) -> dict[str, Any]:
    predicted = (proba >= threshold).astype(int)
    precision, recall, f1, _ = precision_recall_fscore_support(
        y_true, predicted, average="binary", zero_division=0
    )
    tn, fp, fn, tp = confusion_matrix(y_true, predicted, labels=[0, 1]).ravel()
    return {
        "threshold": round(float(threshold), 4),
        "precision": float(precision),
        "recall": float(recall),
        "f1": float(f1),
        "false_positive_rate": float(fp / (fp + tn)) if (fp + tn) else 0.0,
        "confusion_matrix": {"tn": int(tn), "fp": int(fp), "fn": int(fn), "tp": int(tp)},
    }


def bootstrap_ci(
    y_true: IntArray, proba: FloatArray, seed: int = 0, rounds: int = 500
) -> dict[str, list[float]]:
    """95% bootstrap intervals for ROC-AUC and PR-AUC (resampling rows with replacement)."""
    rng = np.random.default_rng(seed)
    roc: list[float] = []
    pr: list[float] = []
    n = len(y_true)
    while len(roc) < rounds:
        idx = rng.integers(0, n, n)
        if len(set(y_true[idx])) < 2:
            continue
        roc.append(float(roc_auc_score(y_true[idx], proba[idx])))
        pr.append(float(average_precision_score(y_true[idx], proba[idx])))
    return {
        "roc_auc_95ci": [float(np.percentile(roc, 2.5)), float(np.percentile(roc, 97.5))],
        "pr_auc_95ci": [float(np.percentile(pr, 2.5)), float(np.percentile(pr, 97.5))],
    }


def evaluate(
    y_true: IntArray,
    proba: FloatArray,
    extra_thresholds: tuple[float, ...] = (),
    with_ci: bool = True,
) -> dict[str, Any]:
    frac_pos, mean_pred = calibration_curve(y_true, proba, n_bins=10, strategy="quantile")
    thresholds = sorted({*REPORT_THRESHOLDS, *(round(t, 4) for t in extra_thresholds)})
    result: dict[str, Any] = {
        "n": len(y_true),
        "positive_rate": float(np.mean(y_true)),
        "roc_auc": float(roc_auc_score(y_true, proba)),
        "pr_auc": float(average_precision_score(y_true, proba)),
        "brier_score": float(brier_score_loss(y_true, proba)),
        "at_thresholds": [at_threshold(y_true, proba, t) for t in thresholds],
        "calibration": {
            "mean_predicted": [float(x) for x in mean_pred],
            "observed_fraction": [float(x) for x in frac_pos],
        },
    }
    if with_ci:
        result.update(bootstrap_ci(y_true, proba))
    return result
