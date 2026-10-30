import math

import pandas as pd

from app.features import (
    FEATURE_COLUMNS,
    engineer_features,
    levenshtein,
    username_contains_official,
    username_similarity,
)


def one(**kwargs: object) -> pd.Series:
    base: dict[str, object] = {"username": "someone"}
    base.update(kwargs)
    return engineer_features(pd.DataFrame([base])).iloc[0]


def test_levenshtein_known_values() -> None:
    assert levenshtein("kitten", "sitting") == 3
    assert levenshtein("", "abc") == 3
    assert levenshtein("same", "same") == 0


def test_similarity_catches_lookalike_edits() -> None:
    assert username_similarity("acmebank", "acmebank") == 1.0
    assert username_similarity("acmebank_", "acmebank") > 0.85
    assert username_similarity("acmeb4nk", "acmebank") > 0.95  # leetspeak normalised
    assert username_similarity("mira.kowalski", "acmebank") < 0.4


def test_contains_official_excludes_identical_and_short_names() -> None:
    assert username_contains_official("acmebank_hq", "acmebank") == 1.0
    assert username_contains_official("acmebank", "acmebank") == 0.0
    assert username_contains_official("abcx", "abc") == 0.0


def test_zero_counts_do_not_divide_by_zero() -> None:
    f = one(followers=0, following=0, posts=0, account_age_days=0)
    assert f["log_followers_to_following"] == 0.0
    assert f["log_posts_per_day"] == 0.0
    assert all(math.isfinite(f[c]) for c in ["log_followers", "log_following", "log_posts"])


def test_unavailable_stays_nan_never_invented() -> None:
    f = one()  # nothing but a username
    for column in ("log_followers", "image_similarity", "bio_length", "verified_flag",
                   "username_similarity", "profile_completeness"):
        assert math.isnan(f[column]), column
    assert f["username_length"] == 7


def test_empty_bio_is_zero_but_missing_bio_is_nan() -> None:
    assert one(bio="")["bio_length"] == 0
    assert math.isnan(one(bio=None)["bio_length"])


def test_promo_keywords_use_word_boundaries() -> None:
    assert one(bio="Crypto giveaway, DM to claim!")["bio_promo_keyword_count"] == 3
    assert one(bio="window winnerless")["bio_promo_keyword_count"] == 0


def test_output_columns_are_stable() -> None:
    assert list(engineer_features(pd.DataFrame([{"username": "a"}])).columns) == FEATURE_COLUMNS
