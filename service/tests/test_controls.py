"""Limits and access checks apply before a run opens its stream."""

from __future__ import annotations

import importlib
import json
import time
from threading import BoundedSemaphore

import pytest
from fastapi.testclient import TestClient

from autoopt_service.app import app

service_app = importlib.import_module("autoopt_service.app")
SOURCE = "input x; print(x);"


def test_shared_secret_protects_every_route_except_health(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("AUTOOPT_SERVICE_TOKEN", "local-secret")
    with TestClient(app) as client:
        assert client.get("/health").status_code == 200
        for path in ("/ready", "/methods", "/schema", "/openapi.json"):
            assert client.get(path).status_code == 401
            assert client.get(path, headers={"Authorization": "Bearer wrong"}).status_code == 401
            assert (
                client.get(path, headers={"Authorization": "Bearer local-secret"}).status_code
                == 200
            )
        assert client.post("/analyze", json={"source": SOURCE}).status_code == 401
        assert client.post("/optimize", json={"source": SOURCE}).status_code == 401


def test_large_body_is_rejected_before_parsing() -> None:
    with TestClient(app) as client:
        response = client.post("/analyze", content=b"x" * (service_app.MAX_REQUEST_BYTES + 1))
    assert response.status_code == 413
    assert response.json()["detail"] == "request body too large"
    assert response.headers["x-request-id"]


def test_chunked_large_body_is_rejected() -> None:
    chunks = iter([b"x" * 20_000, b"y" * 20_000])
    with TestClient(app) as client:
        response = client.post("/analyze", content=chunks)
    assert response.status_code == 413


def test_busy_service_refuses_new_compute_work(monkeypatch: pytest.MonkeyPatch) -> None:
    slots = BoundedSemaphore(1)
    slots.acquire()
    monkeypatch.setattr(service_app, "SLOTS", slots)
    with TestClient(app) as client:
        assert client.post("/analyze", json={"source": SOURCE}).status_code == 503
        assert client.post("/optimize", json={"source": SOURCE}).status_code == 503
        assert client.get("/ready").status_code == 503
    slots.release()


def test_analysis_timeout_keeps_slot_until_worker_exits(monkeypatch: pytest.MonkeyPatch) -> None:
    slots = BoundedSemaphore(1)
    monkeypatch.setattr(service_app, "SLOTS", slots)
    monkeypatch.setattr(service_app, "REQUEST_TIMEOUT_SECONDS", 0.01)
    real_analyze = service_app.analyze

    def slow_analyze(source: str):  # type: ignore[no-untyped-def]
        time.sleep(0.1)
        return real_analyze(source)

    monkeypatch.setattr(service_app, "analyze", slow_analyze)
    with TestClient(app) as client:
        response = client.post("/analyze", json={"source": SOURCE})
        assert response.status_code == 504
        assert client.post("/analyze", json={"source": SOURCE}).status_code == 503
    time.sleep(0.15)
    assert slots.acquire(blocking=False)
    slots.release()


def test_stream_timeout_is_a_terminal_event(monkeypatch: pytest.MonkeyPatch) -> None:
    streaming = importlib.import_module("autoopt_service.streaming")
    slots = BoundedSemaphore(1)
    monkeypatch.setattr(service_app, "SLOTS", slots)
    monkeypatch.setattr(service_app, "REQUEST_TIMEOUT_SECONDS", 0.01)

    def slow_optimize(*args, **kwargs) -> None:  # type: ignore[no-untyped-def]
        time.sleep(0.05)

    monkeypatch.setattr(streaming, "optimize", slow_optimize)
    with TestClient(app) as client:
        response = client.post("/optimize", json={"source": SOURCE})
    event = json.loads(response.text.strip())
    assert event["kind"] == "run_failed"
    assert event["error_type"] == "TimeoutError"
    time.sleep(0.07)
    assert slots.acquire(blocking=False)
    slots.release()


def test_openapi_has_route_groups_and_source_example() -> None:
    with TestClient(app) as client:
        spec = client.get("/openapi.json").json()
    paths = spec["paths"]
    assert paths["/analyze"]["post"]["tags"] == ["analysis"]
    assert paths["/optimize"]["post"]["tags"] == ["optimization"]
    assert spec["components"]["schemas"]["AnalyzeRequest"]["properties"]["source"]["examples"]


def test_request_log_matches_response_id(monkeypatch: pytest.MonkeyPatch) -> None:
    records: list[str] = []
    monkeypatch.setattr(service_app.logger, "info", records.append)
    with TestClient(app) as client:
        response = client.get("/health")
    record = json.loads(records[-1])
    assert record["request_id"] == response.headers["x-request-id"]
    assert record["path"] == "/health"
    assert record["status"] == 200
    assert record["duration_ms"] >= 0
