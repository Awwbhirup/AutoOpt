"""The service contract: what it streams, and how it fails.

Failure is most of what is tested here. Anything that goes wrong after the
first line is on the wire cannot change the status code, so the stream itself
has to carry the news, and a consumer reading only the status would see a run
that died as a run that finished.
"""

from __future__ import annotations

import json
from collections.abc import Iterator

import httpx
import pytest
from autoopt.search import METHOD_NAMES
from fastapi.testclient import TestClient

from autoopt_service.app import app
from autoopt_service.schemas import MAX_SOURCE_CHARS

SOURCE = """
input x;
int a = 2 + 3;
int b = x + a;
int c = x + a;
int d = c * 1;
print(b);
print(d);
"""

#: Parses, but the second line is not a statement the language has.
BROKEN_SOURCE = """
input x;
this is not minilang;
"""


@pytest.fixture
def client() -> Iterator[TestClient]:
    with TestClient(app) as test_client:
        yield test_client


def lines(response: httpx.Response) -> list[dict[str, object]]:
    """The NDJSON body as objects, one per line."""
    return [json.loads(line) for line in response.text.splitlines() if line.strip()]


def post(client: TestClient, **overrides: object) -> httpx.Response:
    payload: dict[str, object] = {"source": SOURCE, "method": "greedy"}
    payload.update(overrides)
    return client.post("/optimize", json=payload)


# --- the happy path ----------------------------------------------------------------


def test_health_reports_the_methods_it_has(client: TestClient) -> None:
    response = client.get("/health")
    assert response.status_code == 200
    assert response.json()["methods"] == len(METHOD_NAMES)


def test_methods_come_from_the_engine_registry(client: TestClient) -> None:
    """Restating the list here is how it would come to disagree with the engine."""
    response = client.get("/methods")
    names = [entry["name"] for entry in response.json()["methods"]]
    assert names == list(METHOD_NAMES)


def test_llm_arms_are_labelled_as_such(client: TestClient) -> None:
    """The application tier needs to know which methods call a model."""
    entries = client.get("/methods").json()["methods"]
    by_name = {entry["name"]: entry["kind"] for entry in entries}
    assert by_name["greedy"] == "rule_based"
    assert by_name["llm"] == "llm"


def test_a_run_streams_its_decision_log(client: TestClient) -> None:
    response = post(client)
    assert response.status_code == 200
    assert "application/x-ndjson" in response.headers["content-type"]

    events = lines(response)
    assert events[0]["kind"] == "run_started"
    assert events[-1]["kind"] == "run_converged"


def test_the_log_carries_what_the_spec_asks_for(client: TestClient) -> None:
    """Opportunity, proposal, verification, cost, decision. In that order, per step."""
    kinds = {event["kind"] for event in lines(post(client))}
    assert {
        "opportunity_found",
        "candidate_proposed",
        "verification_result",
        "cost_evaluated",
        "decision",
    } <= kinds


def test_sequence_numbers_are_monotonic(client: TestClient) -> None:
    """The ordering key of the decision log. A consumer sorts on it."""
    seqs = [event["seq"] for event in lines(post(client))]
    assert seqs == sorted(seqs)
    assert len(set(seqs)) == len(seqs)


def test_the_run_ends_with_a_verdict(client: TestClient) -> None:
    """PASS/FAIL against the original, and a cost that did not get worse."""
    events = lines(post(client))
    started, converged = events[0], events[-1]

    assert converged["output_match"] is True
    assert converged["final_cost"]["weighted_total"] <= started["initial_cost"]["weighted_total"]


def test_the_caller_can_name_the_run(client: TestClient) -> None:
    """Echoed into every event, so several runs can share one consumer."""
    events = lines(post(client, program_id="sample_42", category="arithmetic"))
    assert {event["run_id"] for event in events} == {"sample_42"}
    assert events[0]["category"] == "arithmetic"


@pytest.mark.parametrize("method", ["greedy", "fixed_pipeline", "astar", "random_baseline"])
def test_every_rule_method_runs(client: TestClient, method: str) -> None:
    events = lines(post(client, method=method))
    assert events[-1]["kind"] == "run_converged"


def test_the_same_seed_gives_the_same_log(client: TestClient) -> None:
    """Reproducibility is a property of the engine; the service must not break it."""
    first = lines(post(client, method="simulated_annealing", seed=7))
    second = lines(post(client, method="simulated_annealing", seed=7))
    assert first == second


# --- failure -----------------------------------------------------------------------


def test_unknown_method_is_refused_before_the_stream_opens(client: TestClient) -> None:
    """The one error knowable in advance, so it gets a status code."""
    response = post(client, method="not_a_method")
    assert response.status_code == 422
    assert "not_a_method" in response.json()["detail"]


def test_a_program_that_will_not_parse_ends_the_stream_with_a_failure(
    client: TestClient,
) -> None:
    """Discovered after the response has begun, so it arrives as the last line.

    A consumer that checks only the status code would read this as success,
    which is exactly why the line exists.
    """
    response = post(client, source=BROKEN_SOURCE)
    assert response.status_code == 200

    last = lines(response)[-1]
    assert last["kind"] == "run_failed"
    assert last["error_type"]
    assert last["message"]


def test_failure_carries_no_traceback(client: TestClient) -> None:
    """Internals are not the caller's business."""
    last = lines(post(client, source=BROKEN_SOURCE))[-1]
    assert "Traceback" not in str(last["message"])
    assert 'File "' not in str(last["message"])


def test_oversized_source_is_rejected(client: TestClient) -> None:
    """A run has to finish inside the caller's request timeout."""
    response = post(client, source="input x;\n" + ("int a = 1;\n" * MAX_SOURCE_CHARS))
    assert response.status_code == 422


def test_empty_source_is_rejected(client: TestClient) -> None:
    assert post(client, source="").status_code == 422


def test_absurd_iteration_count_is_rejected(client: TestClient) -> None:
    """Bounds a request's claim on a worker."""
    assert post(client, max_iterations=10_000_000).status_code == 422


def test_negative_seed_is_rejected(client: TestClient) -> None:
    assert post(client, seed=-1).status_code == 422


# --- the published vocabulary ------------------------------------------------------


def test_schema_lists_every_event_kind(client: TestClient) -> None:
    """Including the one the service adds, which the engine knows nothing about."""
    kinds = client.get("/schema").json()["event_kinds"]
    assert "run_started" in kinds
    assert "run_converged" in kinds
    assert "run_failed" in kinds


def test_schema_is_derived_from_the_engine(client: TestClient) -> None:
    """Written out by hand, this list would end up missing whatever came last."""
    from autoopt.events import OptimizationType

    published = client.get("/schema").json()["optimization_types"]
    assert published == [member.value for member in OptimizationType]


def test_every_kind_the_stream_emits_is_published(client: TestClient) -> None:
    """The guard that matters: a consumer trusting /schema must not meet a kind
    that is missing from it."""
    published = set(client.get("/schema").json()["event_kinds"])
    seen = {event["kind"] for event in lines(post(client, method="astar"))}
    assert seen <= published


def test_the_failure_kind_is_published_too(client: TestClient) -> None:
    published = set(client.get("/schema").json()["event_kinds"])
    seen = {event["kind"] for event in lines(post(client, source=BROKEN_SOURCE))}
    assert seen <= published
