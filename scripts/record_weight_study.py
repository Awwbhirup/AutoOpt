"""Which cost weights work best: a grid over the four weights, judged by run time.

The weights 0.4 / 0.3 / 0.2 / 0.1 came from the handout, for a different project.
This tries every combination on a 0.1 grid (each weight at least 0.1, summing to 1),
plus the four single-term models, and runs the optimizer with each on all 500
programs. The weights cannot judge themselves, so each combination is scored by
something it does not define: how many instructions the optimized program actually
executes in the interpreter, on the same inputs, against the original. Code size
(instruction count) breaks ties.

Rewrites are verified exactly as in a normal run. Verdicts are cached per pair of
programs, because the same rewrite comes up under many weightings and its verdict
does not depend on them.

    python scripts/record_weight_study.py

Writes reports/generated/weights/*.csv and weights.json.
"""

from __future__ import annotations

import csv
import itertools
import json
import os
import sys
import time
from multiprocessing import Pool
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "engine"))

from autoopt.cost import CostWeights, measure
from autoopt.datagen import generate
from autoopt.interp import execute
from autoopt.ir import source_to_tac
from autoopt.orchestrator import RunConfig, agent, optimize
from autoopt.verify import FAST, input_vectors

OUT = ROOT / "reports" / "generated" / "weights"
METHODS = ("greedy", "astar")
BASELINE = (0.4, 0.3, 0.2, 0.1)


def grid() -> list[tuple[float, float, float, float]]:
    """Every split of 1.0 into four weights of at least 0.1, in steps of 0.1, plus each term alone."""
    combos = [
        tuple(round(x / 10, 1) for x in c)
        for c in itertools.product(range(1, 8), repeat=4)
        if sum(c) == 10
    ]
    alone = [tuple(1.0 if i == j else 0.0 for i in range(4)) for j in range(4)]
    return [c for c in combos] + alone  # type: ignore[misc]


_real_verify = agent.verify
_verdicts: dict[tuple[str, str, int, bool], object] = {}


def _cached_verify(original, candidate, **kwargs):  # type: ignore[no-untyped-def]
    key = (
        original.canonical_hash(),
        candidate.canonical_hash(),
        id(kwargs.get("profile")),
        bool(kwargs.get("use_smt")),
    )
    if key not in _verdicts:
        _verdicts[key] = _real_verify(original, candidate, **kwargs)
    return _verdicts[key]


agent.verify = _cached_verify


def executed(program, vectors) -> float:  # type: ignore[no-untyped-def]
    """Mean instructions executed over the vectors where the run finished."""
    steps = [
        r.steps
        for r in (execute(program, v, step_limit=FAST.step_limit) for v in vectors)
        if r.conclusive
    ]
    return sum(steps) / len(steps) if steps else 0.0


def run_program(
    program_id: str, category: str, source: str, method: str
) -> list[dict[str, object]]:
    _verdicts.clear()
    tac = source_to_tac(source)
    vectors = input_vectors(tac, seed=0, profile=FAST)
    base_steps = executed(tac, vectors)
    base = measure(tac)
    rows = []
    for weights in grid():
        result = optimize(
            tac,
            config=RunConfig(method=method, weights=CostWeights(*weights)),
            program_id=program_id,
            category=category,
        )
        after = measure(result.final)
        steps = executed(result.final, vectors)
        rows.append(
            {
                "program_id": program_id,
                "category": category,
                "method": method,
                "weights": weights,
                "runtime_cut": 100 * (1 - steps / base_steps) if base_steps else 0.0,
                "size_cut": 100
                * (1 - after.instruction_count / base.instruction_count),
                "temps_cut": 100 * (1 - after.temp_vars / base.temp_vars)
                if base.temp_vars
                else 0.0,
                "arith_cut": 100 * (1 - after.arithmetic_ops / base.arithmetic_ops)
                if base.arithmetic_ops
                else 0.0,
                "output_match": result.output_match,
            }
        )
    return rows


def _job(args: tuple[str, str, str, str]) -> list[dict[str, object]]:
    return run_program(*args)


def summarise(rows: list[dict[str, object]]) -> list[dict[str, object]]:
    groups: dict[tuple[str, tuple[float, ...]], list[dict[str, object]]] = {}
    for r in rows:
        groups.setdefault((str(r["method"]), r["weights"]), []).append(r)  # type: ignore[arg-type]
    table = []
    for (method, weights), members in groups.items():
        n = len(members)
        table.append(
            {
                "method": method,
                "w_instructions": weights[0],
                "w_arithmetic": weights[1],
                "w_temps": weights[2],
                "w_exec": weights[3],
                "runtime_cut_pct": round(
                    sum(float(m["runtime_cut"]) for m in members) / n, 2
                ),  # type: ignore[arg-type]
                "size_cut_pct": round(
                    sum(float(m["size_cut"]) for m in members) / n, 2
                ),  # type: ignore[arg-type]
                "temps_cut_pct": round(
                    sum(float(m["temps_cut"]) for m in members) / n, 2
                ),  # type: ignore[arg-type]
                "arith_cut_pct": round(
                    sum(float(m["arith_cut"]) for m in members) / n, 2
                ),  # type: ignore[arg-type]
                "distance": round(
                    sum(abs(a - b) for a, b in zip(weights, BASELINE, strict=True)), 2
                ),
                "changed": sum(
                    1 for a, b in zip(weights, BASELINE, strict=True) if a != b
                ),
                "wrong_outputs": sum(1 for m in members if not m["output_match"]),
                "programs": n,
            }
        )
    # Run time first, then code size, temporaries and arithmetic; among weightings that
    # still tie, the one closest to the handout's and then the one that changes fewest
    # weights, so the handout's choice is changed only as far as the evidence asks.
    table.sort(
        key=lambda r: (  # type: ignore[operator]
            r["method"],
            -r["runtime_cut_pct"],
            -r["size_cut_pct"],
            -r["temps_cut_pct"],
            -r["arith_cut_pct"],
            r["distance"],
            r["changed"],
        )
    )
    for method in METHODS:
        ranked = [r for r in table if r["method"] == method]
        for i, r in enumerate(ranked, 1):
            r["rank"] = i
    return table


def by_category(rows, method, weights_list):  # type: ignore[no-untyped-def]
    out = []
    cats = sorted({str(r["category"]) for r in rows})
    for w in weights_list:
        for c in cats:
            m = [
                r
                for r in rows
                if r["method"] == method and r["weights"] == w and r["category"] == c
            ]
            out.append(
                {
                    "weights": "/".join(str(x) for x in w),
                    "category": c,
                    "runtime_cut_pct": round(
                        sum(float(x["runtime_cut"]) for x in m) / len(m), 2
                    ),
                    "size_cut_pct": round(
                        sum(float(x["size_cut"]) for x in m) / len(m), 2
                    ),
                }
            )
    return out


def _greedy_pair(
    program_id: str, category: str, source: str, chosen: tuple[float, ...]
) -> dict[str, object]:
    tac = source_to_tac(source)
    vectors = input_vectors(tac, seed=0, profile=FAST)
    base_steps = executed(tac, vectors)
    base = measure(tac)
    out: dict[str, object] = {"program_id": program_id, "category": category}
    for name, weights in (("handout", BASELINE), ("chosen", chosen)):
        result = optimize(
            tac, config=RunConfig(method="greedy", weights=CostWeights(*weights))
        )
        after = measure(result.final)
        steps = executed(result.final, vectors)
        out[name + "_runtime_cut"] = (
            100 * (1 - steps / base_steps) if base_steps else 0.0
        )
        out[name + "_size_cut"] = 100 * (
            1 - after.instruction_count / base.instruction_count
        )
        out[name + "_match"] = result.output_match
    return out


def full_corpus(corpus, chosen):  # type: ignore[no-untyped-def]
    """Greedy over all 500 programs with the handout weights and the chosen ones."""
    jobs = [(p.program_id, p.category.value, p.source, chosen) for p in corpus]
    with Pool(os.cpu_count()) as pool:
        rows = pool.starmap(_greedy_pair, jobs, chunksize=4)
    table = []
    cats = ["all", *sorted({str(r["category"]) for r in rows})]
    for c in cats:
        m = [r for r in rows if c in ("all", r["category"])]
        entry: dict[str, object] = {"category": c, "programs": len(m)}
        for name in ("handout", "chosen"):
            for k in ("runtime_cut", "size_cut"):
                entry[f"{name}_{k}_pct"] = round(
                    sum(float(r[f"{name}_{k}"]) for r in m) / len(m),
                    2,  # type: ignore[arg-type]
                )
            entry[f"{name}_wrong"] = sum(1 for r in m if not r[f"{name}_match"])
        entry["programs_better"] = sum(
            1
            for r in m
            if float(r["chosen_runtime_cut"]) > float(r["handout_runtime_cut"]) + 1e-9  # type: ignore[arg-type]
        )
        entry["programs_worse"] = sum(
            1
            for r in m
            if float(r["chosen_runtime_cut"]) < float(r["handout_runtime_cut"]) - 1e-9  # type: ignore[arg-type]
        )
        table.append(entry)
    return table


def write_csv(name: str, table: list[dict[str, object]]) -> None:
    with (OUT / name).open("w", newline="", encoding="utf-8") as fh:
        writer = csv.DictWriter(fh, fieldnames=list(table[0]))
        writer.writeheader()
        writer.writerows(table)


def main() -> int:
    OUT.mkdir(parents=True, exist_ok=True)
    corpus = generate()
    # 20 programs from each category: the grid times two methods is 176 runs per program.
    per = int(os.environ.get("WEIGHT_STUDY_PER_CATEGORY", "20"))
    seen: dict[str, int] = {}
    jobs = []
    for p in corpus:
        if seen.get(p.category.value, 0) < per:
            seen[p.category.value] = seen.get(p.category.value, 0) + 1
            # One job per program and method, A* first: the slow ones start early and the
            # quick greedy jobs fill the cores at the end.
            jobs.append((p.program_id, p.category.value, p.source))
    work = [(*j, m) for m in reversed(METHODS) for j in jobs]
    progress = OUT / "progress.txt"
    started = time.monotonic()
    rows: list[dict[str, object]] = []
    with Pool(os.cpu_count()) as pool:
        for done, part in enumerate(pool.imap_unordered(_job, work), 1):
            rows.extend(part)
            spent = time.monotonic() - started
            left = spent / done * (len(work) - done)
            line = (
                f"{done}/{len(work)} jobs ({100 * done / len(work):.0f}%), "
                f"{spent / 60:.1f} min so far, about {left / 60:.0f} min left"
            )
            progress.write_text(line + "\n", encoding="utf-8")
            print(line, flush=True)
    table = summarise(rows)
    best = {
        m: next(r for r in table if r["method"] == m and r["rank"] == 1)
        for m in METHODS
    }
    base = {
        m: next(
            r
            for r in table
            if r["method"] == m
            and (r["w_instructions"], r["w_arithmetic"], r["w_temps"], r["w_exec"])
            == BASELINE
        )
        for m in METHODS
    }
    # A* reaches the same programs under almost every weighting, so the choice is made
    # by greedy, the method that is sensitive to them.
    chosen = tuple(
        best["greedy"][k]
        for k in ("w_instructions", "w_arithmetic", "w_temps", "w_exec")
    )
    write_csv("grid.csv", table)
    cats = by_category(rows, "greedy", [BASELINE, chosen])
    write_csv("by_category.csv", cats)
    full = full_corpus(corpus, chosen)
    write_csv("full_corpus.csv", full)
    (OUT / "weights.json").write_text(
        json.dumps(
            {
                "programs": len(jobs),
                "combinations": len(grid()),
                "methods": list(METHODS),
                "baseline": BASELINE,
                "best": best,
                "at_baseline": base,
                "chosen": chosen,
                "grid": table,
                "by_category": cats,
                "full_corpus": full,
            },
            indent=1,
        ),
        encoding="utf-8",
    )
    for m in METHODS:
        print(
            m,
            "best",
            best[m],
            "| baseline rank",
            base[m]["rank"],
            base[m]["runtime_cut_pct"],
            base[m]["size_cut_pct"],
        )
    return 0


if __name__ == "__main__":
    sys.exit(main())
