"""The editor receives the same control flow and facts as the engine."""

from __future__ import annotations

from fastapi.testclient import TestClient

from autoopt_service.app import app
from autoopt_service.schemas import MAX_SOURCE_CHARS

SOURCE = "input x; int y = x + 1; if (y > 0) { print(y); }"


def test_analysis_has_tac_edges_and_dataflow() -> None:
    response = TestClient(app).post("/analyze", json={"source": SOURCE})
    assert response.status_code == 200
    result = response.json()
    assert [line["index"] for line in result["tac"]] == list(range(len(result["tac"])))
    assert result["edges"] == [
        {"source": 0, "target": 2, "kind": "false"},
        {"source": 0, "target": 1, "kind": "true"},
        {"source": 1, "target": 2, "kind": "fallthrough"},
    ]
    first = result["blocks"][0]
    assert first["facts"]["live_in"] == ["x"]
    assert first["facts"]["live_out"] == ["y"]
    assert first["facts"]["reaching_out"] == [0, 1, 2]
    assert {tuple(fact["expression"]) for fact in first["facts"]["available_out"]} == {
        ("+", "x", "1"),
        (">", "y", "0"),
    }
    assert first["stop"] == result["blocks"][1]["start"]


def test_source_error_has_position() -> None:
    response = TestClient(app).post("/analyze", json={"source": "input x;\nint y = ;"})
    assert response.status_code == 422
    assert response.json()["detail"] == {
        "kind": "parse",
        "message": "expected an expression, found ';'",
        "line": 2,
        "column": 9,
    }


def test_analysis_rejects_oversized_source() -> None:
    response = TestClient(app).post("/analyze", json={"source": "x" * (MAX_SOURCE_CHARS + 1)})
    assert response.status_code == 422


def test_empty_program_has_no_blocks() -> None:
    response = TestClient(app).post("/analyze", json={"source": "  "})
    assert response.status_code == 200
    assert response.json() == {"tac": [], "blocks": [], "edges": []}
