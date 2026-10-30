from __future__ import annotations

import logging
import os
import time
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from pathlib import Path

import pandas as pd
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware

from app.explain import describe, explain_row
from app.model_store import LoadedModel, ModelLoadError, load_model
from app.schemas import (
    Contribution,
    HealthResponse,
    ModelInfo,
    PredictRequest,
    PredictResponse,
)

SERVICE_VERSION = "0.2.0"
TOP_CONTRIBUTIONS = 8
logger = logging.getLogger("ml-service")


def _default_model_dir() -> Path:
    base = Path(os.environ.get("MODEL_DIR", "/app/models"))
    return base / os.environ.get("ACTIVE_MODEL_VERSION", "v1")


def create_app(model_dir: Path | None = None) -> FastAPI:
    directory = model_dir or _default_model_dir()
    state: dict[str, LoadedModel | None] = {"model": None}

    @asynccontextmanager
    async def lifespan(_: FastAPI) -> AsyncIterator[None]:
        try:
            state["model"] = load_model(directory)
            meta = state["model"].metadata  # type: ignore[union-attr]
            logger.info("model loaded: %s %s", meta["model_name"], meta["model_version"])
        except ModelLoadError as exc:
            # Stay up so /health can report the problem; /predict returns 503.
            logger.error("model not loaded: %s", exc)
        yield

    app = FastAPI(title="SocialGuard ML Service", version=SERVICE_VERSION, lifespan=lifespan)

    # Local development only: lets the browser demo UI call this service directly.
    # In production the ML service is private and only the backend calls it.
    origins = [
        o.strip()
        for o in os.environ.get(
            "CORS_ORIGINS",
            "http://localhost:5173,http://127.0.0.1:5173,http://10.244.202.218:5173",
        ).split(",")
        if o.strip()
    ]
    app.add_middleware(
        CORSMiddleware,
        allow_origins=origins,
        allow_methods=["GET", "POST"],
        allow_headers=["content-type"],
    )

    def require_model() -> LoadedModel:
        model = state["model"]
        if model is None:
            raise HTTPException(status_code=503, detail="model not loaded")
        return model

    @app.get("/health", response_model=HealthResponse)
    def health() -> HealthResponse:
        return HealthResponse(
            status="ok",
            service="ml-service",
            version=SERVICE_VERSION,
            model_loaded=state["model"] is not None,
        )

    @app.get("/model/info", response_model=ModelInfo)
    def model_info() -> ModelInfo:
        model = require_model()
        meta, test = model.metadata, model.metrics["test"]
        return ModelInfo(
            model_name=meta["model_name"],
            model_version=meta["model_version"],
            dataset_version=meta["dataset_version"],
            dataset_kind=meta["dataset_kind"],
            feature_schema_version=meta["feature_schema_version"],
            class_weight=meta["class_weight"],
            trained_at=meta["trained_at"],
            test_metrics={
                "roc_auc": test["roc_auc"],
                "pr_auc": test["pr_auc"],
                "brier_score": test["brier_score"],
            },
            caveat=model.metrics["caveat"],
        )

    @app.post("/predict", response_model=PredictResponse)
    def predict(request: PredictRequest) -> PredictResponse:
        model = require_model()
        started = time.perf_counter()
        fields = request.profile.model_dump()
        raw = pd.DataFrame([fields])
        explanation = explain_row(model.pipeline, raw)

        contributions = []
        for term in explanation.terms[:TOP_CONTRIBUTIONS]:
            label, shown, available = describe(term)
            contributions.append(
                Contribution(
                    feature=term.feature,
                    label=label,
                    value=shown,
                    available=available,
                    contribution=round(term.contribution, 4),
                    direction="increases_risk" if term.contribution > 0 else "decreases_risk",
                )
            )
        meta = model.metadata
        logger.info(
            "predict request_id=%s model=%s latency_ms=%.1f",
            request.request_id,
            meta["model_version"],
            (time.perf_counter() - started) * 1000,
        )
        return PredictResponse(
            request_id=request.request_id,
            risk_probability=round(explanation.probability, 5),
            model_name=meta["model_name"],
            model_version=meta["model_version"],
            dataset_version=meta["dataset_version"],
            feature_schema_version=meta["feature_schema_version"],
            intercept=round(explanation.intercept, 4),
            contributions=contributions,
            unavailable_fields=sorted(k for k, v in fields.items() if v is None),
        )

    return app


app = create_app()
