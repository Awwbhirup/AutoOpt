from __future__ import annotations

import pytest

from autoopt.ir import source_to_tac
from autoopt.orchestrator import RunConfig, optimize
from autoopt.search import METHOD_NAMES, build_strategy, default_strategies

PLATEAU = "input n; int a = n; int b = a; int c = b; print(c);"
CONST_CHAIN = "int k = 5; int x = k + 1; int y = x + 2; print(y);"
MIXED = (
    "input n; int f = 10*20; int z = n+0; int d = n*2; int u = 77; "
    "int c = (n+1)*(n+1); print(f+z+d+c);"
)
LOOPY = "input n; int c = 0; int i = 0; while (i < n) { c = (n+1)*(n+1); i = i + 1; } print(c);"

ALL_CASES = [PLATEAU, CONST_CHAIN, MIXED, LOOPY]

OFFLINE_METHODS = tuple(m for m in METHOD_NAMES if m != "llm")

STEPWISE = ("fixed_pipeline", "greedy", "random_baseline")
PLATEAU_CROSSING = ("astar", "hill_climbing", "simulated_annealing")


def run(source: str, method: str):  # type: ignore[no-untyped-def]
    return optimize(source_to_tac(source), config=RunConfig(method=method))


# --- every method has to be correct first --------------------------------------


@pytest.mark.parametrize("method", OFFLINE_METHODS)
@pytest.mark.parametrize("source", ALL_CASES)
def test_every_method_preserves_behaviour(method: str, source: str) -> None:
    """Correctness is never traded for cost, whatever the method.

    The search methods relax the requirement that every step lower cost. They do
    not relax verification, and this is what says so.
    """
    result = run(source, method)
    assert result.output_match


@pytest.mark.parametrize("method", OFFLINE_METHODS)
@pytest.mark.parametrize("source", ALL_CASES)
def test_no_method_makes_a_program_worse(method: str, source: str) -> None:
    result = run(source, method)
    assert result.cost_after <= result.cost_before


@pytest.mark.parametrize("method", METHOD_NAMES)
def test_every_method_is_buildable(method: str) -> None:
    # llm is built lazily rather than living in default_strategies, so that
    # nothing constructs a provider chain unless that method is asked for.
    assert build_strategy(method).name == method


# --- the phase ordering result --------------------------------------------------


@pytest.mark.parametrize("method", STEPWISE)
def test_stepwise_methods_stall_on_the_plateau(method: str) -> None:
    """Copy propagation is cost neutral, so a step-by-step method cannot take it.

    This is the spec's acceptance rule working exactly as written, not a defect.
    """
    assert run(PLATEAU, method).cost_reduction == 0.0


@pytest.mark.parametrize("method", PLATEAU_CROSSING)
def test_search_methods_cross_the_plateau(method: str) -> None:
    # Copy propagation makes the earlier assignment dead, and dead code
    # elimination then removes it. Neither step alone passes the gate.
    result = run(PLATEAU, method)
    assert result.cost_reduction > 0.5
    assert result.output_match


@pytest.mark.parametrize("source", [PLATEAU, CONST_CHAIN, MIXED])
def test_search_beats_greedy(source: str) -> None:
    """The headline comparison, and the reason `method` is the ANOVA treatment."""
    greedy = run(source, "greedy").cost_reduction
    astar = run(source, "astar").cost_reduction
    assert astar > greedy


def test_random_baseline_separates_search_from_luck() -> None:
    # Without this control, A* beating greedy could be explained by exploring
    # more states rather than by choosing better ones.
    assert run(PLATEAU, "random_baseline").cost_reduction == 0.0
    assert run(PLATEAU, "astar").cost_reduction > 0.0


# --- behaviour of individual methods ---------------------------------------------


def test_fixed_pipeline_follows_its_order() -> None:
    result = run(MIXED, "fixed_pipeline")
    order = list(default_strategies()["fixed_pipeline"].ORDER)  # type: ignore[attr-defined]
    positions = [order.index(kind) for kind in result.applied]
    assert positions == sorted(positions)


def test_astar_reports_states_seen() -> None:
    result = run(MIXED, "astar")
    assert result.nodes_expanded > 0


def test_already_optimal_program_is_untouched_by_every_method() -> None:
    for method in OFFLINE_METHODS:
        result = run("input n; print(n);", method)
        assert result.accepted == 0
        assert result.cost_reduction == 0.0


# --- reproducibility --------------------------------------------------------------


@pytest.mark.parametrize("method", OFFLINE_METHODS)
def test_methods_are_reproducible(method: str) -> None:
    # The randomised methods are seeded, so a rerun has to match exactly or the
    # experiment cannot be regenerated.
    first, second = run(MIXED, method), run(MIXED, method)
    assert first.final.canonical_hash() == second.final.canonical_hash()
    assert first.applied == second.applied
    assert first.cost_after == second.cost_after
