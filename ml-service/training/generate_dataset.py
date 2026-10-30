"""Synthetic profile generator  --  DEMO DATA ONLY.

The distributions below are assumptions written by the project author. A model trained on this
data demonstrates that the pipeline works; it says NOTHING about accuracy on real accounts.

Usage:
    python -m training.generate_dataset --name synthetic_v1
    python -m training.generate_dataset --name synthetic_shift --profile shifted --seed 7
"""

from __future__ import annotations

import argparse
import json
from datetime import UTC, datetime
from typing import Any

import numpy as np
import pandas as pd

from app.features import PROMO_KEYWORDS
from training.common import DATA_DIR, LABEL_COLUMN, dataset_paths

GENERATOR_VERSION = "1.0"
Rng = np.random.Generator

_SYLLABLES = ["ka", "ro", "mi", "ta", "no", "le", "sa", "vi", "du", "re", "an", "el", "or", "ba"]
_FILLER = ["love", "travel", "music", "coffee", "daily", "life", "photos", "news", "tips", "art"]


def _word(rng: Rng, parts: int) -> str:
    return "".join(rng.choice(_SYLLABLES, size=parts))


def _official_handle(rng: Rng) -> str:
    base = _word(rng, int(rng.integers(2, 4))) + str(rng.choice(["bank", "tech", "uni", "media", "co"]))
    return base


def _genuine_username(rng: Rng) -> str:
    first, last = _word(rng, 2), _word(rng, 2)
    style = int(rng.integers(0, 4))
    if style == 0:
        return f"{first}{last}"
    if style == 1:
        return f"{first}_{last}"
    if style == 2:
        return f"{first}.{last}{int(rng.integers(70, 99))}"
    return f"{first}{rng.choice(_FILLER)}"


def _mutate(rng: Rng, official: str) -> str:
    """Typical impersonation edits of an official handle."""
    name = official
    for _ in range(int(rng.integers(1, 3))):
        move = int(rng.integers(0, 6))
        if move == 0:
            name += str(rng.integers(1, 999))
        elif move == 1:
            name = name.replace("o", "0", 1) if "o" in name else name + "_"
        elif move == 2:
            name = name + str(rng.choice(["_official", ".official", "_hq", "_real", "_support"]))
        elif move == 3 and len(name) > 3:
            i = int(rng.integers(0, len(name) - 1))
            name = name[:i] + name[i + 1] + name[i] + name[i + 2 :]
        elif move == 4:
            i = int(rng.integers(0, len(name)))
            name = name[:i] + name[i] + name[i:]
        else:
            name = name.replace("l", "1", 1) if "l" in name else name.replace("i", "l", 1)
    return name


def _random_digits_username(rng: Rng) -> str:
    return f"{_word(rng, 2)}{int(rng.integers(100, 99999))}"


def _bio(rng: Rng, length: float, promo_hits: int) -> str:
    words: list[str] = []
    while sum(len(w) + 1 for w in words) < length:
        words.append(str(rng.choice(_FILLER)))
    for _ in range(promo_hits):
        words.insert(int(rng.integers(0, len(words) + 1)), str(rng.choice(PROMO_KEYWORDS)))
    return " ".join(words)


def _lognormal(rng: Rng, median: float, sigma: float) -> float:
    return float(rng.lognormal(np.log(median), sigma))


def _build(
    rng: Rng,
    official: str,
    username: str,
    age: float,
    followers: float,
    following: float,
    post_rate: float,
    p_image: float,
    p_link: float,
    p_empty_bio: float,
    promo_lambda: float,
    image_sim: tuple[float, float],
    repeated: tuple[float, float],
    p_verified: float,
    label: int,
) -> dict[str, Any]:
    age = float(np.clip(age, 3, 6000))
    posts = int(age * post_rate * rng.uniform(0.6, 1.4))
    bio_len = 0.0 if rng.random() < p_empty_bio else float(np.clip(rng.normal(75, 35), 8, 250))
    return {
        "username": username,
        "official_username": official,
        "account_age_days": age,
        "followers": int(followers),
        "following": int(following),
        "posts": posts,
        "bio": _bio(rng, bio_len, int(rng.poisson(promo_lambda))) if bio_len > 0 else "",
        "has_profile_image": bool(rng.random() < p_image),
        "external_link_present": bool(rng.random() < p_link),
        "verified": bool(rng.random() < p_verified),
        "image_similarity": float(rng.beta(*image_sim)),
        "repeated_content_ratio": float(rng.beta(*repeated)),
        LABEL_COLUMN: label,
    }


def _genuine(rng: Rng, official: str, profile: str) -> dict[str, Any]:
    roll = rng.random()
    if roll < 0.12:  # legitimate brand-new accounts: look young and small (hard negatives)
        return _build(rng, official, _genuine_username(rng), _lognormal(rng, 35, 0.8),
                      _lognormal(rng, 35, 1.1), _lognormal(rng, 150, 0.8), 0.3, 0.9, 0.2, 0.2,
                      0.1, (1, 12), (1, 10), 0.0, 0)
    if roll < 0.18:  # fan / tribute accounts: similar name, similar image, but long-lived
        fan = official + str(rng.choice(["fans", "_updates", "news", "_community"]))
        return _build(rng, official, fan, _lognormal(rng, 500, 0.9), _lognormal(rng, 900, 1.3),
                      _lognormal(rng, 300, 0.8), 0.4, 0.95, 0.35, 0.1, 0.25, (3, 6), (1, 10),
                      0.0, 0)
    followers_median = 400 if profile == "default" else 250
    return _build(rng, official, _genuine_username(rng), _lognormal(rng, 700, 0.9),
                  _lognormal(rng, followers_median, 1.6), _lognormal(rng, 350, 0.9), 0.25,
                  0.95, 0.25, 0.15, 0.1, (1, 12), (1, 10), 0.03, 0)


def _fake(rng: Rng, official: str, profile: str) -> dict[str, Any]:
    roll = rng.random()
    if profile == "shifted":
        # Harder, more sophisticated fakes: older accounts, believable follower ratios.
        if roll < 0.55:
            return _build(rng, official, _mutate(rng, official), _lognormal(rng, 300, 0.9),
                          _lognormal(rng, 500, 1.3), _lognormal(rng, 450, 0.8), 0.3, 0.9, 0.3,
                          0.15, 0.3, (5, 4), (2, 6), 0.0, 1)
        return _build(rng, official, _random_digits_username(rng), _lognormal(rng, 120, 1.0),
                      _lognormal(rng, 120, 1.2), _lognormal(rng, 900, 0.7), 1.5, 0.7, 0.5,
                      0.3, 1.0, (1.5, 8), (4, 4), 0.0, 1)
    if roll < 0.45:  # impersonator
        age = _lognormal(rng, 400 if rng.random() < 0.15 else 60, 0.9)
        return _build(rng, official, _mutate(rng, official), age, _lognormal(rng, 150, 1.5),
                      _lognormal(rng, 600, 0.8), 0.3, 0.97, 0.45, 0.1, 0.6, (7, 3), (2, 7),
                      0.0, 1)
    if roll < 0.80:  # bot / spam
        return _build(rng, official, _random_digits_username(rng), _lognormal(rng, 90, 1.0),
                      _lognormal(rng, 60, 1.2), _lognormal(rng, 1800, 0.6), 4.0, 0.55, 0.7,
                      0.4, 2.0, (1.5, 8), (6, 3), 0.0, 1)
    return _build(rng, official, _random_digits_username(rng), _lognormal(rng, 30, 0.9),  # sock
                  _lognormal(rng, 25, 1.0), _lognormal(rng, 120, 0.8), 0.6, 0.7, 0.3, 0.3,
                  0.4, (2, 7), (3, 4), 0.0, 1)


def generate(n: int, prevalence: float, seed: int, profile: str) -> pd.DataFrame:
    rng = np.random.default_rng(seed)
    rows: list[dict[str, Any]] = []
    for _ in range(n):
        official = _official_handle(rng)
        is_fake = rng.random() < prevalence
        rows.append(_fake(rng, official, profile) if is_fake else _genuine(rng, official, profile))
    frame = pd.DataFrame(rows)

    # 3% label noise: real labels are never perfect.
    flip = rng.random(n) < 0.03
    frame.loc[flip, LABEL_COLUMN] = 1 - frame.loc[flip, LABEL_COLUMN]

    # Providers often cannot supply everything. Missingness is independent of the label.
    def blank(column: str, probability: float) -> None:
        frame[column] = frame[column].astype("object")
        frame.loc[rng.random(n) < probability, column] = None

    blank("official_username", 0.30)
    blank("image_similarity", 0.30)
    blank("repeated_content_ratio", 0.40)
    blank("verified", 0.20)
    blank("bio", 0.05)
    for column in ("account_age_days", "followers", "following", "posts"):
        blank(column, 0.03)
    return frame


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--name", default="synthetic_v1")
    parser.add_argument("--n", type=int, default=20000)
    parser.add_argument("--prevalence", type=float, default=0.15)
    parser.add_argument("--seed", type=int, default=2026)
    parser.add_argument("--profile", choices=["default", "shifted"], default="default")
    args = parser.parse_args()

    frame = generate(args.n, args.prevalence, args.seed, args.profile)
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    csv_path, meta_path = dataset_paths(args.name)
    frame.to_csv(csv_path, index=False)
    meta = {
        "dataset_version": args.name,
        "dataset_kind": "SYNTHETIC",
        "generator_version": GENERATOR_VERSION,
        "generator_profile": args.profile,
        "seed": args.seed,
        "rows": len(frame),
        "label_prevalence": float(frame[LABEL_COLUMN].mean()),
        "label_noise": 0.03,
        "created_at": datetime.now(UTC).isoformat(),
        "warning": "DEMO DATA. Synthetic; not valid evidence of real-world model performance.",
    }
    meta_path.write_text(json.dumps(meta, indent=2))
    print(f"Wrote {csv_path} ({len(frame)} rows, prevalence {meta['label_prevalence']:.3f})")


if __name__ == "__main__":
    main()
