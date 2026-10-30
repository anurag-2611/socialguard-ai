from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, ConfigDict, Field


class ProfileInput(BaseModel):
    """Raw public profile data. Any field a provider could not supply must be null (UNAVAILABLE)."""

    model_config = ConfigDict(extra="forbid")

    username: str = Field(min_length=1, max_length=64, pattern=r"^[A-Za-z0-9._]+$")
    official_username: str | None = Field(default=None, max_length=64, pattern=r"^[A-Za-z0-9._]+$")
    account_age_days: float | None = Field(default=None, ge=0, le=40000)
    followers: int | None = Field(default=None, ge=0, le=10_000_000_000)
    following: int | None = Field(default=None, ge=0, le=10_000_000_000)
    posts: int | None = Field(default=None, ge=0, le=100_000_000)
    bio: str | None = Field(default=None, max_length=2000)
    has_profile_image: bool | None = None
    external_link_present: bool | None = None
    verified: bool | None = None
    image_similarity: float | None = Field(default=None, ge=0, le=1)
    repeated_content_ratio: float | None = Field(default=None, ge=0, le=1)


class PredictRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    request_id: str | None = Field(default=None, max_length=64)
    profile: ProfileInput


class Contribution(BaseModel):
    feature: str
    label: str
    value: str  # human-readable ("about 12 days") or "UNAVAILABLE"
    available: bool
    contribution: float  # log-odds units; positive pushes toward "suspicious"
    direction: Literal["increases_risk", "decreases_risk"]


class PredictResponse(BaseModel):
    request_id: str | None
    risk_probability: float
    model_name: str
    model_version: str
    dataset_version: str
    feature_schema_version: str
    intercept: float
    contributions: list[Contribution]
    unavailable_fields: list[str]
    signal_type: Literal["MODEL_SIGNAL"] = "MODEL_SIGNAL"
    disclaimer: str = (
        "Model signal, not proven fact. This probability does not establish identity, intent, "
        "or policy violation."
    )


class ModelInfo(BaseModel):
    model_name: str
    model_version: str
    dataset_version: str
    dataset_kind: str
    feature_schema_version: str
    class_weight: str | None
    trained_at: str
    test_metrics: dict[str, float]
    caveat: str


class HealthResponse(BaseModel):
    status: str
    service: str
    version: str
    model_loaded: bool
