"""Guards against results that depend on Python's per-process hash seed.

Facts live in frozensets. Iterating one unsorted and taking the first match gives
a different answer on different runs, because string hashing is randomised per
process. That is invisible to an ordinary test, which runs in one process with
one seed, and it silently breaks the reproducibility the statistics layer needs:
the same program would optimize differently on different runs, and the corpus
results could not be regenerated.

These tests re-run the pipeline in fresh subprocesses under fixed, differing hash
seeds and compare the output exactly.
"""

from __future__ import annotations

import os
import subprocess
import sys
import textwrap

SEEDS = ("0", "1", "12345")

PROGRAMS = [
    "input n; int f = 10 * 20; int z = n + 0; int u = 5; print(f);",
    "input a; input b; int x = (a+b)*(a+b); int y = (a+b)+(a+b); print(x+y);",
    "input n; int k = 5; int i = 0; while (i < n) { int c = (n+1)*(n+1); i = i + 1; } print(i);",
    "input n; int a = n; int b = a; int c = b; print(c);",
]


def _run(script: str, seed: str) -> str:
    # Inherit the environment and override only the seed. Replacing it wholesale
    # drops variables Windows needs to start a process at all.
    environment = dict(os.environ)
    environment["PYTHONHASHSEED"] = seed
    result = subprocess.run(
        [sys.executable, "-c", textwrap.dedent(script)],
        capture_output=True,
        text=True,
        env=environment,
        check=True,
    )
    return result.stdout


def _under_seeds(script: str) -> set[str]:
    return {_run(script, seed) for seed in SEEDS}


def test_opportunities_are_hash_seed_independent() -> None:
    script = f"""
        from autoopt.ir import source_to_tac, build_cfg
        from autoopt.rules import analyse
        for source in {PROGRAMS!r}:
            found = analyse(build_cfg(source_to_tac(source)))
            print("|".join(
                f"{{o.kind.value}}@{{o.site}}:{{sorted(o.detail.items())}}" for o in found
            ))
    """
    assert len(_under_seeds(script)) == 1


def test_analysis_lookups_are_hash_seed_independent() -> None:
    script = f"""
        from autoopt.ir import source_to_tac, build_cfg
        from autoopt.analysis import available_expressions, constants, copies, expression_of
        for source in {PROGRAMS!r}:
            program = source_to_tac(source)
            cfg = build_cfg(program)
            av, cs, cp = available_expressions(cfg), constants(cfg), copies(cfg)
            for index, instruction in enumerate(program):
                key = expression_of(instruction)
                print(
                    av.holder_of(index, key) if key else None,
                    [cs.value_of(index, n) for n in sorted(instruction.uses)],
                    [cp.source_of(index, n) for n in sorted(instruction.uses)],
                )
    """
    assert len(_under_seeds(script)) == 1


def test_optimized_output_is_hash_seed_independent() -> None:
    # The end-to-end property that actually matters: running the agent loop twice
    # must produce the same program, or the corpus results cannot be regenerated.
    script = f"""
        from autoopt.ir import source_to_tac, build_cfg
        from autoopt.rules import analyse
        from autoopt.transforms import apply
        from autoopt.cost import CostModel
        for source in {PROGRAMS!r}:
            current = source_to_tac(source)
            model = CostModel.for_program(current)
            for _ in range(40):
                for opportunity in analyse(build_cfg(current)):
                    candidate = apply(current, opportunity)
                    if candidate is None:
                        continue
                    if model.score(candidate).total >= model.score(current).total:
                        continue
                    current = candidate
                    break
                else:
                    break
            print(current.canonical_hash(), len(current))
    """
    assert len(_under_seeds(script)) == 1
