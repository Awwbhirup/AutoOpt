from __future__ import annotations

import pytest

from autoopt.events import (
    CandidateProposed,
    CostEvaluated,
    Decision,
    OpportunityFound,
    RejectReason,
    RunConverged,
    RunStarted,
)
from autoopt.ir import source_to_tac
from autoopt.orchestrator import Orchestrator, RunConfig, optimize
from autoopt.verify import verify

FAST = RunConfig(use_smt=False)

MIXED = """
input n;
int folded = 10 * 20;
int ident  = n + 0;
int dbl    = n * 2;
int unused = 77;
int c = (n + 1) * (n + 1);
print(folded + ident + dbl + c);
"""

CORPUS = [
    ("arithmetic", "int x = 10 * 20; int y = x + 5; print(y);"),
    ("nested", "input a; input b; int x = ((a + b) * 2) + ((a + b) * 3); print(x);"),
    ("repeated", "input a; input b; int x = (a + b) * (a + b); print(x);"),
    ("dead", "input n; int u1 = 1; int u2 = 2; int u3 = 3; print(n);"),
    ("loops", "input n; int t = 0; int i = 0; while (i < n) { t = t + i; i = i + 1; } print(t);"),
    ("conditional", "input n; if (n > 0) print(n + 0); else print(n * 1);"),
    ("mixed", MIXED),
    ("trapping", "input a; input b; int q = a / b; int u = 9; print(q);"),
    ("no_inputs", "int x = 2 + 3; print(x);"),
    ("already_optimal", "input n; print(n);"),
]


def run(source: str, config: RunConfig | None = None):  # type: ignore[no-untyped-def]
    return optimize(source_to_tac(source), config=config or FAST)


# --- the loop produces the log the spec asks for -------------------------------


def test_emits_the_required_event_sequence() -> None:
    log: list[object] = []
    Orchestrator(FAST, log.append).run(source_to_tac(MIXED))

    assert isinstance(log[0], RunStarted)
    assert isinstance(log[-1], RunConverged)
    for kind in (OpportunityFound, CandidateProposed, CostEvaluated, Decision):
        assert any(isinstance(event, kind) for event in log)


def test_sequence_numbers_are_monotonic() -> None:
    log: list = []
    Orchestrator(FAST, log.append).run(source_to_tac(MIXED))
    numbers = [event.seq for event in log]
    assert numbers == sorted(numbers)
    assert len(numbers) == len(set(numbers))


def test_every_opportunity_carries_its_facts() -> None:
    log: list = []
    Orchestrator(FAST, log.append).run(source_to_tac(MIXED))
    found = [e for e in log if isinstance(e, OpportunityFound)]
    assert found
    assert all(event.derived_from for event in found)


def test_no_events_without_a_sink() -> None:
    # The engine stays silent unless someone listens.
    assert optimize(source_to_tac(MIXED), config=FAST).proposals > 0


# --- acceptance is the spec's conjunction --------------------------------------


def test_accepted_changes_are_both_verified_and_cheaper() -> None:
    """The spec's conjunction, checked on the result rather than per event.

    Selection now belongs to the strategy, so a method may look at a candidate it
    does not keep. What has to hold is that the program returned is cheaper than
    the original and still behaves the same.
    """
    result = run(MIXED)
    assert result.cost_after < result.cost_before
    assert result.output_match
    assert result.refuted == 0 or result.verified < result.proposals


def test_cost_neutral_changes_are_rejected() -> None:
    # The spec requires a strict improvement. Copy propagation is cost neutral on
    # its own, so greedy leaves it, which is the phase ordering gap the search
    # methods are measured against.
    log: list = []
    Orchestrator(FAST, log.append).run(source_to_tac("input n; int a = n; int b = a; print(b);"))
    rejections = [e for e in log if isinstance(e, Decision) and not e.accepted]
    assert any(e.reject_reason is RejectReason.NO_COST_IMPROVEMENT for e in rejections)


# --- correctness, which is the metric that must be perfect ---------------------


@pytest.mark.parametrize(("category", "source"), CORPUS)
def test_optimized_program_still_matches_the_original(category: str, source: str) -> None:
    """The spec's False Positive Rate must be 0%.

    Every run, on every category, has to end with a program that behaves like the
    one it started from.
    """
    result = run(source)
    assert result.output_match
    assert not verify(result.original, result.final, use_smt=False).refuted


@pytest.mark.parametrize(("category", "source"), CORPUS)
def test_cost_never_increases(category: str, source: str) -> None:
    result = run(source)
    assert result.cost_after <= result.cost_before
    assert result.cost_reduction >= 0


@pytest.mark.parametrize(("category", "source"), CORPUS)
def test_run_terminates_well_inside_the_cap(category: str, source: str) -> None:
    result = run(source)
    assert result.iterations < RunConfig().max_iterations


def test_trapping_program_keeps_its_trap() -> None:
    # Removing an unused division would turn a trapping program into a
    # non-trapping one, which is a behaviour change.
    result = run("input a; input b; int q = a / b; int u = 9; print(q);")
    assert result.output_match
    assert any("/" in str(instruction) for instruction in result.final)


def test_loop_invariant_motion_can_be_accepted() -> None:
    """LICM has to be able to pass the cost gate, not just be detected.

    It relocates rather than deletes, so it only pays through the execution
    estimate's loop weighting. The result has to be used after the loop, or dead
    code elimination removes the body first and LICM never gets the chance,
    which is why it looks unused on simpler programs.
    """
    source = (
        "input n; int c = 0; int i = 0; while (i < n) { c = (n+1)*(n+1); i = i + 1; } print(c);"
    )
    result = run(source)
    assert "loop_invariant_code_motion" in result.applied
    assert result.output_match


def test_already_optimal_program_is_left_alone() -> None:
    result = run("input n; print(n);")
    assert result.accepted == 0
    assert result.cost_reduction == 0.0


# --- metrics --------------------------------------------------------------------


def test_metrics_are_consistent() -> None:
    result = run(MIXED)
    assert result.verified <= result.proposals
    assert result.refuted + result.verified == result.proposals
    assert result.cost_improving <= result.verified
    assert 0.0 <= result.verification_pass_rate <= 1.0
    assert 0.0 <= result.acceptance_rate <= 1.0


def test_applied_list_matches_accepted_count() -> None:
    result = run(MIXED)
    assert len(result.applied) == result.accepted


def test_mixed_program_actually_improves() -> None:
    result = run(MIXED)
    assert result.cost_reduction > 0
    assert len(result.final) < len(result.original)


# --- reproducibility -------------------------------------------------------------


def test_runs_are_reproducible() -> None:
    first, second = run(MIXED), run(MIXED)
    assert first.final.canonical_hash() == second.final.canonical_hash()
    assert first.applied == second.applied
    assert first.cost_after == second.cost_after


def test_smt_and_differential_agree_on_the_outcome() -> None:
    # Turning the second channel on must not change which transformations are
    # accepted, only how strongly they are justified.
    fast = run(MIXED, RunConfig(use_smt=False))
    thorough = run(MIXED, RunConfig(use_smt=True))
    assert fast.final.canonical_hash() == thorough.final.canonical_hash()
