import pandas as pd

from training.register_dataset import inspect


def test_minimal_csv_is_accepted_with_warnings() -> None:
    frame = pd.DataFrame({"username": ["a", "b", "c", "d"], "label": [0, 0, 1, 1]})
    out, errors, warnings = inspect(frame)
    assert errors == []
    assert any("UNAVAILABLE" in w for w in warnings)
    assert any("rows" in w for w in warnings)
    assert "followers" in out.columns


def test_bad_labels_and_missing_columns_block() -> None:
    assert inspect(pd.DataFrame({"username": ["a"]}))[1]
    bad = pd.DataFrame({"username": ["a", "b"], "label": [0, 2]})
    assert inspect(bad)[1]
