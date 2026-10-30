from pathlib import Path

from fastapi.testclient import TestClient

from app.main import create_app
from tests.conftest import SAMPLE_PROFILE


def test_health_reports_model_loaded(model_dir: Path) -> None:
    with TestClient(create_app(model_dir)) as client:
        body = client.get("/health").json()
    assert body["status"] == "ok" and body["model_loaded"] is True


def test_service_stays_up_without_a_model(tmp_path: Path) -> None:
    with TestClient(create_app(tmp_path / "missing")) as client:
        assert client.get("/health").json()["model_loaded"] is False
        assert client.post("/predict", json={"profile": {"username": "a"}}).status_code == 503
        assert client.get("/model/info").status_code == 503


def test_predict_returns_probability_versions_and_reasons(model_dir: Path) -> None:
    with TestClient(create_app(model_dir)) as client:
        response = client.post(
            "/predict", json={"request_id": "req-1", "profile": SAMPLE_PROFILE}
        )
    assert response.status_code == 200
    body = response.json()
    assert 0.0 <= body["risk_probability"] <= 1.0
    assert body["request_id"] == "req-1"
    assert body["model_version"] == "v-test" and body["dataset_version"] == "test_ds"
    assert body["feature_schema_version"] == "fs-1"
    assert body["signal_type"] == "MODEL_SIGNAL"
    assert "risk_level" not in body  # policy bands live in the API, not the model service
    assert 1 <= len(body["contributions"]) <= 8
    assert {"label", "value", "direction", "contribution"} <= set(body["contributions"][0])


def test_predict_flags_unavailable_fields_honestly(model_dir: Path) -> None:
    with TestClient(create_app(model_dir)) as client:
        body = client.post("/predict", json={"profile": {"username": "plainname"}}).json()
    assert "followers" in body["unavailable_fields"]
    assert "username" not in body["unavailable_fields"]


def test_predict_rejects_bad_input(model_dir: Path) -> None:
    with TestClient(create_app(model_dir)) as client:
        bad = [
            {"profile": {"username": ""}},
            {"profile": {"username": "ok", "followers": -1}},
            {"profile": {"username": "ok", "image_similarity": 1.5}},
            {"profile": {"username": "has space"}},
            {"profile": {"username": "ok", "surprise_field": 1}},
            {"profile": {"username": "ok", "bio": "x" * 2001}},
        ]
        for payload in bad:
            assert client.post("/predict", json=payload).status_code == 422, payload


def test_model_info_includes_caveat(model_dir: Path) -> None:
    with TestClient(create_app(model_dir)) as client:
        body = client.get("/model/info").json()
    assert body["dataset_kind"] == "SYNTHETIC" and "SYNTHETIC" in body["caveat"]


def test_cors_allows_local_frontend_only(model_dir: Path) -> None:
    with TestClient(create_app(model_dir)) as client:
        ok = client.options(
            "/predict",
            headers={
                "Origin": "http://localhost:5173",
                "Access-Control-Request-Method": "POST",
                "Access-Control-Request-Headers": "content-type",
            },
        )
        bad = client.options(
            "/predict",
            headers={"Origin": "https://evil.example", "Access-Control-Request-Method": "POST"},
        )
    assert ok.headers.get("access-control-allow-origin") == "http://localhost:5173"
    assert "access-control-allow-origin" not in bad.headers


def test_cors_allows_frontend_on_configured_lan_ip(model_dir: Path, monkeypatch) -> None:
    monkeypatch.delenv("CORS_ORIGINS", raising=False)
    with TestClient(create_app(model_dir)) as client:
        response = client.options(
            "/predict",
            headers={
                "Origin": "http://10.244.202.218:5173",
                "Access-Control-Request-Method": "POST",
                "Access-Control-Request-Headers": "content-type",
            },
        )
    assert response.status_code == 200
    assert response.headers.get("access-control-allow-origin") == "http://10.244.202.218:5173"


def test_cors_accepts_configured_frontend_origin(model_dir: Path, monkeypatch) -> None:
    monkeypatch.setenv("CORS_ORIGINS", "http://192.168.1.20:5173")
    with TestClient(create_app(model_dir)) as client:
        response = client.options(
            "/predict",
            headers={
                "Origin": "http://192.168.1.20:5173",
                "Access-Control-Request-Method": "POST",
                "Access-Control-Request-Headers": "content-type",
            },
        )
    assert response.status_code == 200
    assert response.headers.get("access-control-allow-origin") == "http://192.168.1.20:5173"
