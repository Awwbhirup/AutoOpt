"""Batch runner: the method x category grid that produces the master CSV.

One row per (program, method). Everything downstream reads that file: the six
required plots, the metrics table, and the whole statistics layer.

Built to survive being left alone. Each cell is isolated, so a program that
raises is recorded as a failure row and the run continues rather than losing the
batch. Results are appended as they complete and already-finished cells are
skipped on a restart, so an interrupted run resumes instead of starting over.
"""

from __future__ import annotations

import csv
import time
import traceback
from collections.abc import Callable, Iterator
from dataclasses import asdict, dataclass, field
from pathlib import Path

from .datagen import GeneratedProgram, generate
from .ir import source_to_tac
from .llm.provider import ProviderExhaustedError
from .orchestrator import RunConfig, optimize
from .search import METHOD_NAMES

FIELDNAMES = [
    "program_id",
    "category",
    "method",
    "node_budget",
    "budget_exhausted",
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
    # LLM methods only. Blank for the rule-based ones, which have no such
    # notion; the spec lists validity as a reported metric, so it belongs in
    # the dataset rather than in console output nothing keeps.
    "llm_calls",
    "llm_cached",
    "llm_validity_rate",
    "llm_by_validity",
    "wall_ms",
    "error",
]


@dataclass
class BatchProgress:
    total: int
    completed: int = 0
    failures: int = 0
    mismatches: int = 0
    started: float = field(default_factory=time.monotonic)

    @property
    def elapsed(self) -> float:
        return time.monotonic() - self.started

    @property
    def rate(self) -> float:
        return self.completed / self.elapsed if self.elapsed else 0.0

    @property
    def remaining_seconds(self) -> float:
        outstanding = self.total - self.completed
        return outstanding / self.rate if self.rate else 0.0


def _row_for(program: GeneratedProgram, method: str, config: RunConfig) -> dict[str, object]:
    import json

    from .cost import measure
    from .events import CostEvaluated

    started = time.monotonic()
    tac = source_to_tac(program.source)

    # Cost after each accepted step, for the spec's per-iteration line chart.
    trajectory: list[float] = []

    def collect(event: object) -> None:
        if isinstance(event, CostEvaluated) and event.improved:
            trajectory.append(round(event.cost_after.weighted_total, 6))

    result = optimize(
        tac,
        config=config,
        sink=collect,
        program_id=program.program_id,
        category=program.category.value,
    )
    before, after = measure(result.original), measure(result.final)
    llm = result.llm

    return {
        "program_id": program.program_id,
        "category": program.category.value,
        "method": method,
        "node_budget": config.node_budget if config.node_budget else 0,
        "budget_exhausted": int(result.budget_exhausted),
        "instructions_before": before.instruction_count,
        "instructions_after": after.instruction_count,
        "arithmetic_before": before.arithmetic_ops,
        "arithmetic_after": after.arithmetic_ops,
        "temps_before": before.temp_vars,
        "temps_after": after.temp_vars,
        "exec_before": before.execution_estimate,
        "exec_after": after.execution_estimate,
        "cost_before": result.cost_before,
        "cost_after": result.cost_after,
        "cost_reduction": result.cost_reduction,
        "iterations": result.iterations,
        "proposals": result.proposals,
        "verified": result.verified,
        "refuted": result.refuted,
        "cost_improving": result.cost_improving,
        "accepted": result.accepted,
        "stale": result.stale,
        "nodes_expanded": result.nodes_expanded,
        "verification_pass_rate": result.verification_pass_rate,
        "acceptance_rate": result.acceptance_rate,
        "output_match": int(result.output_match),
        "final_proof": result.final_proof or "",
        "applied": "|".join(result.applied),
        "by_kind": json.dumps(result.by_kind, separators=(",", ":")),
        "trajectory": "|".join(str(v) for v in trajectory),
        "llm_calls": llm.get("calls", "") if llm else "",
        "llm_cached": llm.get("cached", "") if llm else "",
        "llm_validity_rate": llm.get("validity_rate", "") if llm else "",
        "llm_by_validity": (
            json.dumps(llm.get("by_validity", {}), separators=(",", ":")) if llm else ""
        ),
        "wall_ms": round((time.monotonic() - started) * 1000, 2),
        "error": "",
    }


def _failure_row(program: GeneratedProgram, method: str, error: Exception) -> dict[str, object]:
    row: dict[str, object] = dict.fromkeys(FIELDNAMES, "")
    row.update(
        {
            "program_id": program.program_id,
            "category": program.category.value,
            "method": method,
            "output_match": 0,
            "error": f"{type(error).__name__}: {error}"[:300],
        }
    )
    return row


def _completed_cells(path: Path) -> set[tuple[str, str, str]]:
    if not path.exists():
        return set()
    with path.open(newline="", encoding="utf-8") as handle:
        return {
            (row["program_id"], row["method"], row.get("node_budget", "0"))
            for row in csv.DictReader(handle)
        }


def run_experiment(
    output: Path,
    *,
    methods: tuple[str, ...] = METHOD_NAMES,
    seed: int = 0,
    limit: int | None = None,
    prove_final: bool = True,
    resume: bool = True,
    budgets: tuple[int | None, ...] = (None,),
    on_progress: Callable[[BatchProgress, dict[str, object]], None] | None = None,
) -> BatchProgress:
    """Run every (program, method) cell and append rows as they finish."""
    corpus = generate()
    if limit is not None:
        # Take a slice of each category rather than the first N programs, so a
        # smoke run still covers every category.
        per_category: dict[str, int] = {}
        selected: list[GeneratedProgram] = []
        for program in corpus:
            key = program.category.value
            if per_category.get(key, 0) < limit:
                per_category[key] = per_category.get(key, 0) + 1
                selected.append(program)
        corpus = selected

    output.parent.mkdir(parents=True, exist_ok=True)
    done = _completed_cells(output) if resume else set()
    if not resume and output.exists():
        output.unlink()

    cells = [
        (p, m, b)
        for b in budgets
        for m in methods
        for p in corpus
        if (p.program_id, m, str(b or 0)) not in done
    ]
    progress = BatchProgress(total=len(cells))

    write_header = not output.exists() or output.stat().st_size == 0
    with output.open("a", newline="", encoding="utf-8") as handle:
        writer = csv.DictWriter(handle, fieldnames=FIELDNAMES)
        if write_header:
            writer.writeheader()
            handle.flush()

        for program, method, budget in cells:
            config = RunConfig(
                method=method, seed=seed, prove_final=prove_final, node_budget=budget
            )
            try:
                row = _row_for(program, method, config)
                if not row["output_match"]:
                    progress.mismatches += 1
            except ProviderExhaustedError:
                # Not a bad cell. Every remaining cell would fail the same way,
                # and writing them as errors would bury the finished rows that
                # --resume needs. Stop, keeping what completed.
                raise
            except Exception as error:  # one bad cell must not lose the batch
                row = _failure_row(program, method, error)
                row["error"] = f"{row['error']} | {traceback.format_exc(limit=1)}"[:400]
                progress.failures += 1

            writer.writerow(row)
            handle.flush()

            progress.completed += 1
            if on_progress is not None:
                on_progress(progress, row)

    return progress


def iter_rows(path: Path) -> Iterator[dict[str, str]]:
    with path.open(newline="", encoding="utf-8") as handle:
        yield from csv.DictReader(handle)


def summarise(path: Path) -> dict[str, object]:
    """Headline numbers, for the console and for a quick sanity check."""
    rows = [row for row in iter_rows(path) if not row["error"]]
    if not rows:
        return {"rows": 0}

    reductions = [float(row["cost_reduction"]) for row in rows]
    mismatched = [row for row in rows if row["output_match"] != "1"]

    by_method: dict[str, list[float]] = {}
    for row in rows:
        by_method.setdefault(row["method"], []).append(float(row["cost_reduction"]))

    return {
        "rows": len(rows),
        "mean_reduction": sum(reductions) / len(reductions),
        "output_mismatches": len(mismatched),
        "false_positive_rate": len(mismatched) / len(rows),
        "by_method": {
            method: sum(values) / len(values) for method, values in sorted(by_method.items())
        },
    }


def as_dict(progress: BatchProgress) -> dict[str, object]:
    return asdict(progress)
