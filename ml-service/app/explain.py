"""Per-prediction explanations for the Logistic Regression pipeline.

logit(p) = intercept + sum_j coef_j * x_scaled_j, so each term is that feature's exact additive
contribution in log-odds. Missing-indicator columns are folded into their base feature so
"unavailable" shows up as its own reason.
"""

from __future__ import annotations

import math
from dataclasses import dataclass

import numpy as np
import pandas as pd
from sklearn.compose import ColumnTransformer
from sklearn.linear_model import LogisticRegression
from sklearn.pipeline import Pipeline

from app.features import FEATURE_LABELS, display_value

_INDICATOR_PREFIX = "missingindicator_"


@dataclass(frozen=True)
class Term:
    feature: str
    contribution: float
    value: float  # engineered, unscaled; NaN when unavailable


@dataclass(frozen=True)
class Explanation:
    intercept: float
    terms: list[Term]  # one per base feature, sorted by |contribution| descending

    @property
    def logit(self) -> float:
        return self.intercept + sum(t.contribution for t in self.terms)

    @property
    def probability(self) -> float:
        return 1.0 / (1.0 + math.exp(-self.logit))


def explain_row(pipeline: Pipeline, raw: pd.DataFrame) -> Explanation:
    """Explain a single raw record (a one-row DataFrame)."""
    engineered: pd.DataFrame = pipeline.named_steps["engineer"].transform(raw)
    prep: ColumnTransformer = pipeline.named_steps["prep"]
    clf: LogisticRegression = pipeline.named_steps["clf"]
    transformed = np.asarray(prep.transform(engineered), dtype=float)[0]
    names = [str(n).removeprefix("num__") for n in prep.get_feature_names_out()]

    totals: dict[str, float] = {}
    for name, coef, x in zip(names, clf.coef_[0], transformed, strict=True):
        base = name.removeprefix(_INDICATOR_PREFIX)
        totals[base] = totals.get(base, 0.0) + float(coef) * float(x)

    terms = [
        Term(feature=f, contribution=c, value=float(engineered.iloc[0][f]))
        for f, c in totals.items()
    ]
    terms.sort(key=lambda t: abs(t.contribution), reverse=True)
    return Explanation(intercept=float(clf.intercept_[0]), terms=terms)


def describe(term: Term) -> tuple[str, str, bool]:
    """(label, display value, available)."""
    label = FEATURE_LABELS.get(term.feature, term.feature)
    if math.isnan(term.value):
        return label, "UNAVAILABLE", False
    return label, display_value(term.feature, term.value), True
