"""Break the cost model down into its four terms, from engine output.

Three things the single cost-reduction figure hides:

1. Which terms move. The grid already stores every term before and after, per
   run, so the per-category and per-method tables come straight from it.
2. Where each saving comes from. Cost reduction is a weighted sum over the
   terms, so it splits exactly into one share per term.
3. What each transformation does to the terms. Every opportunity the rules find
   in the original corpus is applied on its own, checked by differential
   testing, and measured, so each transformation gets an average effect.

Plus one program optimized step by step, with every term after every step.

    python scripts/record_cost_breakdown.py

Writes reports/generated/cost/*.csv and cost.json.
"""

from __future__ import annotations

import csv
import json
import os
import sys
from collections import defaultdict
from multiprocessing import Pool
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "engine"))

from autoopt.cost import CostModel, CostWeights, measure
from autoopt.datagen import generate
from autoopt.ir import build_cfg, source_to_tac
from autoopt.orchestrator import RunConfig, optimize
from autoopt.rules import analyse
from autoopt.search import RULE_METHODS
from autoopt.transforms import apply
from autoopt.verify import FAST, verify

GRID = ROOT / "data" / "runs" / "complete.csv"
OUT = ROOT / "reports" / "generated" / "cost"

TERMS = ("instructions", "arithmetic", "temps", "exec")
LABELS = {
    "instructions": "Instruction count",
    "arithmetic": "Arithmetic operations",
    "temps": "Temporaries",
    "exec": "Execution estimate",
}
WEIGHTS = dict(zip(TERMS, CostWeights().as_tuple(), strict=True))


def mean(values: list[float]) -> float:
    return sum(values) / len(values) if values else 0.0


def change(before: float, after: float) -> float:
    """Percentage fall from before to after; 0 when the term was absent."""
    return 100.0 * (before - after) / before if before else 0.0


def shares(row: dict[str, float]) -> dict[str, float]:
    """Split one run's cost reduction into a share per term.

    C = sum_i w_i (x_i / x_i0) / W over the terms the original has, so
    1 - C = sum_i w_i (1 - x_i / x_i0) / W, one addend per term.
    """
    active = [t for t in TERMS if row[t + "_before"] > 0]
    total = sum(WEIGHTS[t] for t in active)
    out = {t: 0.0 for t in TERMS}
    for t in active:
        out[t] = (
            100.0 * WEIGHTS[t] * (1 - row[t + "_after"] / row[t + "_before"]) / total
        )
    return out


def grid_tables() -> tuple[
    list[dict[str, object]], list[dict[str, object]], list[dict[str, object]]
]:
    rows = []
    with GRID.open(newline="", encoding="utf-8") as fh:
        for raw in csv.DictReader(fh):
            if (
                raw["error"]
                or raw["method"] not in RULE_METHODS
                or raw["node_budget"] not in ("", "0")
            ):
                continue
            row: dict[str, float] = {}
            for t in TERMS:
                row[t + "_before"] = float(raw[t + "_before"])
                row[t + "_after"] = float(raw[t + "_after"])
            row["reduction"] = 100.0 * float(raw["cost_reduction"])
            rows.append((raw["method"], raw["category"], row))

    def summarise(
        key: str, groups: dict[str, list[dict[str, float]]]
    ) -> list[dict[str, object]]:
        table = []
        for name, members in groups.items():
            entry: dict[str, object] = {key: name, "runs": len(members)}
            for t in TERMS:
                b = mean([m[t + "_before"] for m in members])
                a = mean([m[t + "_after"] for m in members])
                entry[t + "_before"] = round(b, 2)
                entry[t + "_after"] = round(a, 2)
                entry[t + "_cut_pct"] = round(change(b, a), 1)
            entry["cost_reduction_pct"] = round(
                mean([m["reduction"] for m in members]), 1
            )
            split = [shares(m) for m in members]
            for t in TERMS:
                entry[t + "_share_pct"] = round(mean([s[t] for s in split]), 2)
            table.append(entry)
        return table

    by_method: dict[str, list[dict[str, float]]] = defaultdict(list)
    by_category: dict[str, list[dict[str, float]]] = defaultdict(list)
    for method, category, row in rows:
        by_method[method].append(row)
        # Per category from the best search method only, so the table shows
        # what the optimizer can do rather than an average over weak baselines.
        if method == "astar":
            by_category[category].append(row)
    overall = summarise("set", {"all rule-based runs": [r for _, _, r in rows]})
    return summarise("method", by_method), summarise("category", by_category), overall


def single_moves(
    program_id: str, category: str, source: str
) -> list[dict[str, object]]:
    """Every opportunity in the original, applied alone and measured."""
    tac = source_to_tac(source)
    model = CostModel.for_program(tac)
    before = measure(tac)
    out = []
    for opportunity in analyse(build_cfg(tac)):
        candidate = apply(tac, opportunity)
        if candidate is None:
            continue
        after = measure(candidate)
        outcome = verify(tac, candidate, use_smt=False, profile=FAST)
        out.append(
            {
                "kind": opportunity.kind.value,
                "category": category,
                "d_instructions": before.instruction_count - after.instruction_count,
                "d_arithmetic": before.arithmetic_ops - after.arithmetic_ops,
                "d_temps": before.temp_vars - after.temp_vars,
                "d_exec": before.execution_estimate - after.execution_estimate,
                "cost_cut_pct": 100.0 * model.reduction(model.of(after)),
                "verified": int(not outcome.refuted),
            }
        )
    return out


def transformation_table(corpus) -> list[dict[str, object]]:
    jobs = [(p.program_id, p.category.value, p.source) for p in corpus]
    with Pool(os.cpu_count()) as pool:
        results = pool.starmap(single_moves, jobs, chunksize=8)
    groups: dict[str, list[dict[str, object]]] = defaultdict(list)
    for moves in results:
        for move in moves:
            groups[str(move["kind"])].append(move)
    table = []
    for kind, moves in sorted(groups.items(), key=lambda kv: -len(kv[1])):
        table.append(
            {
                "transformation": kind,
                "applications": len(moves),
                "verified_pct": round(
                    100.0 * mean([float(m["verified"]) for m in moves]), 1
                ),
                "mean_d_instructions": round(
                    mean([float(m["d_instructions"]) for m in moves]), 2
                ),
                "mean_d_arithmetic": round(
                    mean([float(m["d_arithmetic"]) for m in moves]), 2
                ),
                "mean_d_temps": round(mean([float(m["d_temps"]) for m in moves]), 2),
                "mean_d_exec": round(mean([float(m["d_exec"]) for m in moves]), 2),
                "mean_cost_cut_pct": round(
                    mean([float(m["cost_cut_pct"]) for m in moves]), 2
                ),
                "improving_pct": round(
                    100.0 * mean([float(m["cost_cut_pct"]) > 0 for m in moves]), 1
                ),
            }
        )
    return table


def walk(program_id: str, source: str) -> dict[str, object]:
    """Greedy, one step at a time: the cheapest verified improving rewrite each step.

    Same rule as the greedy method; the final cost is checked against it below.
    """
    tac = source_to_tac(source)
    model = CostModel.for_program(tac)
    current = tac

    def snapshot(step: int, kind: str, program) -> dict[str, object]:
        raw = measure(program)
        return {
            "step": step,
            "transformation": kind,
            "instructions": raw.instruction_count,
            "arithmetic": raw.arithmetic_ops,
            "temps": raw.temp_vars,
            "exec": raw.execution_estimate,
            "cost": round(model.of(raw).total, 4),
        }

    steps = [snapshot(0, "original", current)]
    while len(steps) < 40:
        best = None
        current_cost = model.score(current).total
        for opportunity in analyse(build_cfg(current)):
            candidate = apply(current, opportunity)
            if candidate is None:
                continue
            cost = model.score(candidate).total
            if cost >= current_cost:
                continue
            if verify(current, candidate, use_smt=False, profile=FAST).refuted:
                continue
            key = (cost, opportunity.site, opportunity.kind.value)
            if best is None or key < best[0]:
                best = (key, opportunity.kind.value, candidate)
        if best is None:
            break
        current = best[2]
        steps.append(snapshot(len(steps), best[1], current))
    return {
        "program_id": program_id,
        "source": source,
        "original_tac": [str(i) for i in tac],
        "final_tac": [str(i) for i in current],
        "steps": steps,
    }


def pick_example(corpus) -> dict[str, object]:
    """A short program whose greedy path uses the most kinds of rewrite, so the
    table shows different terms moving at different steps."""
    jobs = [
        (p.program_id, p.source)
        for p in corpus
        if len(source_to_tac(p.source).instructions) <= 14
    ]
    with Pool(os.cpu_count()) as pool:
        walks = pool.starmap(walk, jobs, chunksize=4)

    def rank(example: dict[str, object]) -> tuple[int, float, str]:
        steps = example["steps"]
        kinds = {s["transformation"] for s in steps[1:]}  # type: ignore[index]
        return (len(kinds), 1 - float(steps[-1]["cost"]), str(example["program_id"]))  # type: ignore[index]

    example = max((w for w in walks if 4 <= len(w["steps"]) <= 9), key=rank)  # type: ignore[arg-type]
    tac = source_to_tac(str(example["source"]))
    greedy = optimize(
        tac, config=RunConfig(method="greedy"), program_id=str(example["program_id"])
    )
    astar = optimize(
        tac, config=RunConfig(method="astar"), program_id=str(example["program_id"])
    )
    example["greedy_cost_after"] = round(greedy.cost_after, 4)
    example["astar_cost_after"] = round(astar.cost_after, 4)
    example["astar_tac"] = [str(i) for i in astar.final]
    example["astar_applied"] = list(astar.applied)
    raw = measure(astar.final)
    example["astar_terms"] = {
        "instructions": raw.instruction_count,
        "arithmetic": raw.arithmetic_ops,
        "temps": raw.temp_vars,
        "exec": raw.execution_estimate,
    }
    example["proof"] = verify(tac, greedy.final, use_smt=True).verdict.value
    example["astar_proof"] = verify(tac, astar.final, use_smt=True).verdict.value
    return example


def write_csv(name: str, table: list[dict[str, object]]) -> None:
    with (OUT / name).open("w", newline="", encoding="utf-8") as fh:
        writer = csv.DictWriter(fh, fieldnames=list(table[0]))
        writer.writeheader()
        writer.writerows(table)


def main() -> int:
    OUT.mkdir(parents=True, exist_ok=True)
    corpus = generate()
    by_method, by_category, overall = grid_tables()
    transformations = transformation_table(corpus)
    example = pick_example(corpus)

    write_csv("terms_by_method.csv", by_method)
    write_csv("terms_by_category.csv", by_category)
    write_csv("terms_overall.csv", overall)
    write_csv("by_transformation.csv", transformations)
    write_csv("worked_example.csv", example["steps"])  # type: ignore[arg-type]
    (OUT / "cost.json").write_text(
        json.dumps(
            {
                "weights": WEIGHTS,
                "labels": LABELS,
                "overall": overall,
                "by_method": by_method,
                "by_category": by_category,
                "by_transformation": transformations,
                "example": example,
            },
            indent=1,
        ),
        encoding="utf-8",
    )
    steps = example["steps"]
    print(
        f"{len(by_method)} methods, {len(by_category)} categories, {len(transformations)} transformations"
    )
    print(
        f"example {example['program_id']}: {len(steps) - 1} greedy steps to {steps[-1]['cost']},"  # type: ignore[index, arg-type]
        f" A* to {example['astar_cost_after']}, {example['proof']}"
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
