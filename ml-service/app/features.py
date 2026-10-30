"""Feature engineering shared by training and inference.

This module is the single place where raw profile data becomes model features. It is embedded in
the saved sklearn Pipeline (as the first step), so training and serving cannot diverge.

Convention: a value a provider could not supply is NaN here (never invented). The pipeline's
imputer adds explicit missing-indicator columns so "unavailable" is itself visible to the model
and to the explanations.
"""

from __future__ import annotations

import math
import re
from collections.abc import Callable
from typing import Any

import numpy as np
import pandas as pd

FEATURE_SCHEMA_VERSION = "fs-1"

RAW_COLUMNS: list[str] = [
    "username",
    "official_username",
    "account_age_days",
    "followers",
    "following",
    "posts",
    "bio",
    "has_profile_image",
    "external_link_present",
    "verified",
    "image_similarity",
    "repeated_content_ratio",
]

FEATURE_COLUMNS: list[str] = [
    "log_account_age_days",
    "log_followers",
    "log_following",
    "log_posts",
    "log_followers_to_following",
    "log_posts_per_day",
    "username_length",
    "username_digit_ratio",
    "username_special_count",
    "username_similarity",
    "username_contains_official",
    "image_similarity",
    "profile_completeness",
    "external_link_flag",
    "verified_flag",
    "bio_length",
    "bio_promo_keyword_count",
    "repeated_content_ratio",
]

# Spam-style phrases only. A hit is one weak signal among many and never labels anyone by itself.
PROMO_KEYWORDS: tuple[str, ...] = (
    "giveaway",
    "dm to claim",
    "crypto",
    "investment",
    "free followers",
    "click link",
    "winner",
    "earn money",
    "airdrop",
)
_PROMO_RE = re.compile(r"\b(?:" + "|".join(re.escape(k) for k in PROMO_KEYWORDS) + r")\b")
_LEET = str.maketrans({"0": "o", "1": "l", "3": "e", "4": "a", "5": "s", "@": "a", "$": "s"})


def levenshtein(a: str, b: str) -> int:
    """Classic edit distance (insert/delete/substitute)."""
    if a == b:
        return 0
    if not a:
        return len(b)
    if not b:
        return len(a)
    previous = list(range(len(b) + 1))
    for i, ca in enumerate(a, start=1):
        current = [i]
        for j, cb in enumerate(b, start=1):
            current.append(min(previous[j] + 1, current[j - 1] + 1, previous[j - 1] + (ca != cb)))
        previous = current
    return previous[-1]


def _letters_only(s: str) -> str:
    return re.sub(r"[^a-z]", "", s.translate(_LEET))


def username_similarity(candidate: str, official: str) -> float:
    """1.0 = identical after normalisation, 0.0 = nothing in common (edit-distance based)."""
    a, b = candidate.lower(), official.lower()
    scores = []
    for x, y in ((a, b), (_letters_only(a), _letters_only(b))):
        longest = max(len(x), len(y))
        scores.append(1.0 if longest == 0 else 1.0 - levenshtein(x, y) / longest)
    return max(scores)


def username_contains_official(candidate: str, official: str) -> float:
    """1.0 when the official name (>= 4 letters) is embedded in the candidate but not identical."""
    cand, off = _letters_only(candidate.lower()), _letters_only(official.lower())
    if len(off) < 4 or cand == off:
        return 0.0
    return 1.0 if off in cand else 0.0


def _to_float(value: Any) -> float:
    if value is None:
        return math.nan
    if isinstance(value, (bool, np.bool_)):
        return float(value)
    if isinstance(value, str):
        s = value.strip().lower()
        if s in ("true", "1"):
            return 1.0
        if s in ("false", "0"):
            return 0.0
        try:
            return float(s)
        except ValueError:
            return math.nan
    try:
        return float(value)
    except (TypeError, ValueError):
        return math.nan


def _to_text(value: Any) -> str | None:
    if value is None or (isinstance(value, float) and math.isnan(value)):
        return None
    return str(value)


def _row_features(row: dict[str, Any]) -> dict[str, float]:
    nan = math.nan
    age = _to_float(row.get("account_age_days"))
    followers = _to_float(row.get("followers"))
    following = _to_float(row.get("following"))
    posts = _to_float(row.get("posts"))
    has_image = _to_float(row.get("has_profile_image"))
    link = _to_float(row.get("external_link_present"))
    verified = _to_float(row.get("verified"))
    username = _to_text(row.get("username")) or ""
    official = _to_text(row.get("official_username"))
    bio = _to_text(row.get("bio"))

    def log1p(x: float) -> float:
        return math.log1p(max(x, 0.0)) if not math.isnan(x) else nan

    ratio = (
        math.log((followers + 1.0) / (following + 1.0))
        if not (math.isnan(followers) or math.isnan(following))
        else nan
    )
    posts_per_day = (
        math.log1p(max(posts, 0.0) / max(age, 1.0))
        if not (math.isnan(posts) or math.isnan(age))
        else nan
    )

    # Completeness uses only the components that are actually available.
    parts = [
        has_image,
        (float(len(bio.strip()) > 0) if bio is not None else nan),
        (float(posts > 0) if not math.isnan(posts) else nan),
    ]
    present = [p for p in parts if not math.isnan(p)]
    completeness = sum(present) / len(present) if present else nan

    n = max(len(username), 1)
    has_official = bool(official and official.strip())
    return {
        "log_account_age_days": log1p(age),
        "log_followers": log1p(followers),
        "log_following": log1p(following),
        "log_posts": log1p(posts),
        "log_followers_to_following": ratio,
        "log_posts_per_day": posts_per_day,
        "username_length": float(len(username)),
        "username_digit_ratio": sum(c.isdigit() for c in username) / n,
        "username_special_count": float(sum(not c.isalnum() for c in username)),
        "username_similarity": (
            username_similarity(username, official or "") if has_official else nan
        ),
        "username_contains_official": (
            username_contains_official(username, official or "") if has_official else nan
        ),
        "image_similarity": _to_float(row.get("image_similarity")),
        "profile_completeness": completeness,
        "external_link_flag": link,
        "verified_flag": verified,
        "bio_length": float(len(bio.strip())) if bio is not None else nan,
        "bio_promo_keyword_count": (
            float(len(_PROMO_RE.findall(bio.lower()))) if bio is not None else nan
        ),
        "repeated_content_ratio": _to_float(row.get("repeated_content_ratio")),
    }


def engineer_features(raw: pd.DataFrame) -> pd.DataFrame:
    """Raw profile records -> model features (all float, NaN = unavailable)."""
    frame = raw.reindex(columns=RAW_COLUMNS)
    records = [_row_features(r) for r in frame.to_dict(orient="records")]
    return pd.DataFrame.from_records(records, columns=FEATURE_COLUMNS).astype(float)


# ---- Human-readable labels for explanations -------------------------------------------------

FEATURE_LABELS: dict[str, str] = {
    "log_account_age_days": "Account age",
    "log_followers": "Follower count",
    "log_following": "Following count",
    "log_posts": "Post count",
    "log_followers_to_following": "Followers-to-following ratio",
    "log_posts_per_day": "Posting rate",
    "username_length": "Username length",
    "username_digit_ratio": "Digits in username",
    "username_special_count": "Special characters in username",
    "username_similarity": "Username similarity to official account",
    "username_contains_official": "Username embeds the official name",
    "image_similarity": "Profile image similarity to official image",
    "profile_completeness": "Profile completeness",
    "external_link_flag": "External link in profile",
    "verified_flag": "Verified status",
    "bio_length": "Bio length",
    "bio_promo_keyword_count": "Promotional/spam phrases in bio",
    "repeated_content_ratio": "Repeated-content ratio",
}

_DISPLAY: dict[str, Callable[[float], str]] = {
    "log_account_age_days": lambda v: f"about {math.expm1(v):,.0f} days",
    "log_followers": lambda v: f"about {math.expm1(v):,.0f}",
    "log_following": lambda v: f"about {math.expm1(v):,.0f}",
    "log_posts": lambda v: f"about {math.expm1(v):,.0f}",
    "log_followers_to_following": lambda v: f"about {math.exp(v):.2f}",
    "log_posts_per_day": lambda v: f"about {math.expm1(v):.2f} posts/day",
    "external_link_flag": lambda v: "yes" if v >= 0.5 else "no",
    "verified_flag": lambda v: "yes" if v >= 0.5 else "no",
    "username_contains_official": lambda v: "yes" if v >= 0.5 else "no",
}


def display_value(feature: str, value: float) -> str:
    formatter = _DISPLAY.get(feature)
    return formatter(value) if formatter else f"{value:.2f}"
