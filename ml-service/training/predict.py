"""Score one profile from the command line.

    python -m training.predict --version v1 '{"username":"acme_bank_official","official_username":"acmebank","account_age_days":12,"followers":40,"following":900}'
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path

import pandas as pd

from app.explain import describe, explain_row
from app.model_store import load_model
from training.common import MODELS_DIR


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("profile_json")
    parser.add_argument("--version", default="v1")
    parser.add_argument("--models", type=Path, default=MODELS_DIR)
    args = parser.parse_args()

    model = load_model(args.models / args.version)
    explanation = explain_row(model.pipeline, pd.DataFrame([json.loads(args.profile_json)]))
    print(f"risk_probability = {explanation.probability:.3f}  (MODEL SIGNAL, not proven fact)")
    for term in explanation.terms[:8]:
        label, shown, _ = describe(term)
        sign = "+" if term.contribution > 0 else "-"
        print(f"  {sign} {label}: {shown}  ({term.contribution:+.2f} log-odds)")


if __name__ == "__main__":
    main()
