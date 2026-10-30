# ML Service (Python + FastAPI + scikit-learn)

Trains and serves the Logistic Regression risk model. Inference only behind `/predict`; the training code never runs inside the backend.

```bash
python -m venv .venv && source .venv/bin/activate
pip install -r requirements-dev.txt
python -m training.generate_dataset --name synthetic_v1
python -m training.train --dataset synthetic_v1 --version v1
MODEL_DIR=./models ACTIVE_MODEL_VERSION=v1 uvicorn app.main:app --port 8000   # docs at /docs
pytest && ruff check . && mypy app training
```

Folders: `app/` (API + feature engineering + explanations), `training/` (generator, train, evaluate, predict), `data/` (synthetic datasets), `models/` (versioned bundles), `tests/`.
Design and results: `../docs/ml/ml-design.md`. All metrics are on synthetic data.
