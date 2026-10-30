from app.features import RAW_COLUMNS
from training.common import LABEL_COLUMN, validate_schema
from training.generate_dataset import generate


def test_generator_is_reproducible_and_valid() -> None:
    a = generate(500, 0.2, seed=5, profile="default")
    b = generate(500, 0.2, seed=5, profile="default")
    assert a.equals(b)
    validate_schema(a)
    assert set(RAW_COLUMNS) <= set(a.columns)
    assert 0.05 < a[LABEL_COLUMN].mean() < 0.5


def test_generator_leaves_realistic_gaps() -> None:
    frame = generate(2000, 0.2, seed=3, profile="default")
    assert frame["image_similarity"].isna().mean() > 0.2
    assert frame["official_username"].isna().mean() > 0.2
