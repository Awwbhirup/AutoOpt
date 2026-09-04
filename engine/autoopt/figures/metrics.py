"""The spec's metrics table, computed from the master CSV.

Six metrics, with the targets the spec attaches to them:

    Verification Pass Rate   share of proposals that pass verification
    Acceptance Rate          share of verified proposals that also lower cost
    Cost Reduction           mean (original - final) / original, target > 30%
    Steps to Convergence     mean agent-loop iterations, distribution tracked
    LLM Validity Rate        share of LLM suggestions that are usable, if used
    False Positive Rate      accepted changes that were not equivalent, must be 0%

False Positive Rate is the one that has to be exactly zero, and it is measured
rather than asserted: every run ends by comparing the original against the final
program under the thorough profile, and a mismatch is recorded in the row.
"""

from __future__ import annotations

import statistics
from collections.abc import Sequence
from dataclasses import dataclass

Rows = Sequence[dict[str, str]]


@dataclass(frozen=True, slots=True)
class Metric:
    name: str
    value: float
    display: str
    target: str
    meets_target: bool | None


@dataclass(frozen=True, slots=True)
class MetricsTable:
    metrics: list[Metric]
    programs: int
    runs: int
    failures: int

    def as_rows(self) -> list[tuple[str, str, str, str]]:
        marks = {True: "met", False: "MISSED", None: "-"}
        return [(m.name, m.display, m.target, marks[m.meets_target]) for m in self.metrics]


def _mean(values: Sequence[float]) -> float:
    return statistics.fmean(values) if values else 0.0


def compute(rows: Rows, llm_validity: float | None = None) -> MetricsTable:
    usable = [row for row in rows if not row.get("error")]
    failures = len(rows) - len(usable)

    proposals = sum(int(row["proposals"]) for row in usable)
    refuted = sum(int(row["refuted"]) for row in usable)
    verified = proposals - refuted
    improving = sum(int(row["cost_improving"]) for row in usable)

    reductions = [float(row["cost_reduction"]) for row in usable]
    steps = [int(row["accepted"]) for row in usable]
    mismatches = sum(1 for row in usable if row["output_match"] != "1")

    pass_rate = verified / proposals if proposals else 0.0
    acceptance = improving / verified if verified else 0.0
    reduction = _mean(reductions)
    convergence = _mean([float(s) for s in steps])
    false_positive = mismatches / len(usable) if usable else 0.0

    metrics = [
        Metric("Verification Pass Rate", pass_rate, f"{pass_rate:.1%}", "report value", None),
        Metric("Acceptance Rate", acceptance, f"{acceptance:.1%}", "report value", None),
        Metric("Cost Reduction", reduction, f"{reduction:.1%}", "> 30%", reduction > 0.30),
        Metric(
            "Steps to Convergence",
            convergence,
            f"{convergence:.2f} mean, median {statistics.median(steps) if steps else 0:.0f}, max {max(steps) if steps else 0}",
            "track distribution",
            None,
        ),
        Metric(
            "LLM Validity Rate",
            llm_validity if llm_validity is not None else 0.0,
            f"{llm_validity:.1%}" if llm_validity is not None else "not run",
            "report value",
            None,
        ),
        Metric(
            "False Positive Rate",
            false_positive,
            f"{false_positive:.2%}  ({mismatches} of {len(usable)})",
            "must be 0%",
            mismatches == 0,
        ),
    ]

    return MetricsTable(
        metrics=metrics,
        programs=len({row["program_id"] for row in usable}),
        runs=len(usable),
        failures=failures,
    )


def by_method(rows: Rows) -> list[tuple[str, int, float, float, float, int]]:
    """Per method: runs, mean reduction, pass rate, acceptance rate, mismatches.

    This is the table the two-way ANOVA is run against, so it is worth being able
    to read it directly before any statistics are applied.
    """
    usable = [row for row in rows if not row.get("error")]
    grouped: dict[str, list[dict[str, str]]] = {}
    for row in usable:
        grouped.setdefault(row["method"], []).append(row)

    table = []
    for method, group in grouped.items():
        proposals = sum(int(r["proposals"]) for r in group)
        refuted = sum(int(r["refuted"]) for r in group)
        verified = proposals - refuted
        improving = sum(int(r["cost_improving"]) for r in group)
        table.append(
            (
                method,
                len(group),
                _mean([float(r["cost_reduction"]) for r in group]),
                verified / proposals if proposals else 0.0,
                improving / verified if verified else 0.0,
                sum(1 for r in group if r["output_match"] != "1"),
            )
        )

    return sorted(table, key=lambda entry: -entry[2])


def by_category(rows: Rows) -> list[tuple[str, int, float, float]]:
    """Per category: runs, mean reduction, mean steps. The blocking factor."""
    usable = [row for row in rows if not row.get("error")]
    grouped: dict[str, list[dict[str, str]]] = {}
    for row in usable:
        grouped.setdefault(row["category"], []).append(row)

    return sorted(
        (
            (
                category,
                len(group),
                _mean([float(r["cost_reduction"]) for r in group]),
                _mean([float(r["accepted"]) for r in group]),
            )
            for category, group in grouped.items()
        ),
        key=lambda entry: -entry[2],
    )
