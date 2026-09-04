"""Guards for the statistics package.

Not a full test suite for it. Each test here pins an invariant that was broken at
some point and produced a plausible-looking wrong answer rather than an error,
which is the failure mode this package is prone to: nothing raises, the table
just says something untrue.
"""

from __future__ import annotations

import csv
import random
from pathlib import Path

import pandas as pd
import pytest

from autoopt import stats
from autoopt.figures.statistical import _ordered
from autoopt.search import METHOD_NAMES
from autoopt.stats import distributions, reliability, testing
from autoopt.stats.data import METHOD_ORDER, order_methods

COLUMNS = [
    "program_id",
    "category",
    "method",
    "instructions_before",
    "instructions_after",
    "arithmetic_before",
    "arithmetic_after",
    "temps_before",
    "temps_after",
    "exec_before",
    "exec_after",
    "cost_before",
    "cost_after",
    "cost_reduction",
    "iterations",
    "proposals",
    "verified",
    "refuted",
    "cost_improving",
    "accepted",
    "stale",
    "nodes_expanded",
    "verification_pass_rate",
    "acceptance_rate",
    "output_match",
    "final_proof",
    "applied",
    "by_kind",
    "trajectory",
    "wall_ms",
    "node_budget",
    "error",
]

CATEGORIES = ("arithmetic", "repeated", "loops", "mixed")
METHODS = ("greedy", "hill_climbing", "astar")

#: Per method, so the synthetic grid has a real effect to find. A test asserting
#: an ANOVA is estimable proves nothing on data with no signal in it.
EFFECT = {"greedy": 0.10, "hill_climbing": 0.20, "astar": 0.30}


def synthetic(path: Path, *, programs_per_category: int = 8, seed: int = 0) -> Path:
    rng = random.Random(seed)
    rows = []
    for category_index, category in enumerate(CATEGORIES):
        for n in range(programs_per_category):
            program_id = f"{category}_{n:03d}"
            size = 10 + category_index * 8 + n
            for method in METHODS:
                reduction = max(
                    0.0,
                    min(0.95, EFFECT[method] + category_index * 0.05 + rng.gauss(0, 0.03)),
                )
                accepted = 1 + int(reduction * 10)
                rows.append(
                    {
                        "program_id": program_id,
                        "category": category,
                        "method": method,
                        "instructions_before": size,
                        "instructions_after": size - accepted,
                        "arithmetic_before": size // 2,
                        "arithmetic_after": size // 2 - 1,
                        "temps_before": size // 3,
                        "temps_after": size // 3 - 1,
                        "exec_before": size * 2,
                        "exec_after": int(size * 2 * (1 - reduction)),
                        "cost_before": 1.0,
                        "cost_after": 1.0 - reduction,
                        "cost_reduction": reduction,
                        "iterations": accepted + 2,
                        "proposals": accepted * 3,
                        "verified": accepted * 3,
                        "refuted": 0,
                        "cost_improving": accepted,
                        "accepted": accepted,
                        "stale": 1,
                        "nodes_expanded": accepted + 3,
                        "verification_pass_rate": 1.0,
                        "acceptance_rate": 0.4,
                        "output_match": 1,
                        "final_proof": "proven",
                        "applied": "constant_folding",
                        "by_kind": "",
                        "trajectory": "",
                        "wall_ms": 40 + rng.random() * 20,
                        "node_budget": 10,
                        "error": "",
                    }
                )

    with path.open("w", encoding="utf-8", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=COLUMNS)
        writer.writeheader()
        writer.writerows(rows)
    return path


@pytest.fixture
def dataset(tmp_path: Path) -> stats.Dataset:
    return stats.load(synthetic(tmp_path / "runs.csv"))


# --- nothing may be dropped for being unrecognised ----------------------------


def test_every_runnable_method_has_a_presentation_order() -> None:
    """The constant the engine runs from and the one the plots order by must agree.

    They are separate lists in separate packages. When `llm` was added to one and
    not the other, every ordered lookup filtered it out and it vanished from the
    plots, the metrics table and Dataset.methods without raising anything.
    """
    assert set(METHOD_NAMES) <= set(METHOD_ORDER), (
        f"not in METHOD_ORDER: {sorted(set(METHOD_NAMES) - set(METHOD_ORDER))}"
    )


def test_an_unknown_method_is_kept_rather_than_dropped() -> None:
    ordered = order_methods(pd.Series(["astar", "greedy", "something_new"]))
    assert ordered == ["greedy", "astar", "something_new"]


def test_ordered_keeps_levels_the_order_does_not_mention() -> None:
    frame = pd.DataFrame({"method": ["astar", "greedy", "something_new"]})
    assert _ordered(frame, "method", METHOD_ORDER) == ["greedy", "astar", "something_new"]


# --- goodness of fit compares every family, not the ones that happened to work --


def test_every_continuous_family_is_actually_fitted(dataset: stats.Dataset) -> None:
    """A family that raises is skipped silently, so absence has to be asserted against.

    kstest was being handed the family name as a string. scipy spells three of
    them differently, the lookup raised, and the except that skips a genuinely
    unfittable family swallowed it: the M4 table compared two families while
    claiming to compare five.
    """
    fits = distributions.fit_continuous(dataset.frame["cost_reduction"])
    assert {fit.family for fit in fits} == set(distributions.CONTINUOUS_FAMILIES)


# --- a design has to be estimable before its p-values mean anything -----------


def test_three_way_anova_is_not_rank_deficient(dataset: stats.Dataset) -> None:
    """Blocking on a factor confounded with another leaves cells empty.

    The saturated model is then rank deficient and every effect comes back with a
    sum of squares of zero and p = 1, which reads as "nothing matters" instead of
    "this design cannot be fitted".
    """
    table = testing.three_way(dataset.at_budget(10))
    effects = table.drop(index="Residual")

    assert (effects["sum_sq"] >= 0).all(), "negative sum of squares means a rank deficient fit"
    assert effects["sum_sq"].max() > 1e-6, "every effect is zero, so nothing was estimated"
    assert table.loc["Residual", "df"] > 0
    assert effects.loc["C(method)", "PR(>F)"] < 0.05, "the planted method effect was not found"


# --- reliability figures must come from something that measured them ----------


def test_detection_reliability_refuses_to_be_invented() -> None:
    """There is no honest default here, so there is no default.

    Reporting a detection rate taken from the runs gave zero, because the runs
    contain no faults. Silence would have been worse than the error.
    """
    with pytest.raises(reliability.MissingMutationStudyError):
        reliability.channel_reliability(None)


def test_detection_reliability_uses_the_measured_rates() -> None:
    parallel = reliability.channel_reliability(
        {"differential": {"rate": 0.9}, "smt": {"rate": 0.8}}
    )
    assert parallel.r_channel_a == pytest.approx(0.9)
    assert parallel.r_channel_b == pytest.approx(0.8)
    assert parallel.reliability == pytest.approx(1 - 0.1 * 0.2)


def test_refutation_rate_is_reported_separately(dataset: stats.Dataset) -> None:
    """It measures the proposer. Zero here says the rules are sound, not that the
    checkers are useless, which is what conflating the two implied."""
    rate = reliability.refutation_rate(dataset.at_budget(10))
    assert rate["refuted"] == 0
    assert rate["rate"] == 0.0


# --- the blocking factor the designs depend on --------------------------------


def test_relative_size_is_assigned_per_program_not_per_row(dataset: stats.Dataset) -> None:
    """One program has one size, so every run of it belongs to one stratum.

    Ranking rows instead scattered a program across strata depending on which
    duplicate row broke the tie, and left the Latin Square with unfillable cells.
    """
    per_program = dataset.frame.groupby("program_id")["relative_size"].nunique()
    assert (per_program == 1).all()


def test_relative_size_is_balanced_within_each_category(dataset: stats.Dataset) -> None:
    counts = pd.crosstab(dataset.frame["category"], dataset.frame["relative_size"])
    assert (counts > 0).all().all(), "a size stratum is empty for some category"
