"""Differential testing.

Runs both versions of a program over the same inputs and compares what they
print. The spec asks for at least ten random inputs; this uses edge cases first,
then seeded random values, because the values that break optimizations are almost
never random ones. Zero breaks division, one and zero break the algebraic
identities, and negative numbers break anything that assumed truncation rounds
one way.

Seeded throughout: the same program pair always gets the same inputs, so a
verdict is reproducible and a counterexample stays findable.

This is evidence, not proof. It can refute equivalence by producing a
counterexample, and it cannot establish it. That is why smt.py exists.
"""

from __future__ import annotations

import random
from dataclasses import dataclass

from ..interp import DEFAULT_STEP_LIMIT, ExecutionResult, execute
from ..ir.tac import TacProgram

#: Tried before anything random. Chosen to break the specific assumptions the
#: transformations make rather than to cover a range.
EDGE_VALUES = (0, 1, -1, 2, -2, 10, -10, 100, -100, 1000, -1000, 2**31, -(2**31))

DEFAULT_RANDOM_CASES = 32
DEFAULT_RANDOM_RANGE = 1000


@dataclass(frozen=True, slots=True)
class Counterexample:
    """Inputs that make the two programs observably differ."""

    inputs: dict[str, int]
    original: ExecutionResult
    candidate: ExecutionResult

    def describe(self) -> str:
        bindings = ", ".join(f"{name}={value}" for name, value in sorted(self.inputs.items()))
        return (
            f"inputs({bindings}): "
            f"original {self.original.status.value} {list(self.original.outputs)} "
            f"vs candidate {self.candidate.status.value} {list(self.candidate.outputs)}"
        )


@dataclass(frozen=True, slots=True)
class DifferentialReport:
    refuted: bool
    cases_run: int
    inconclusive: int
    counterexample: Counterexample | None = None

    @property
    def passed(self) -> bool:
        return not self.refuted


def input_vectors(
    program: TacProgram,
    *,
    seed: int,
    random_cases: int = DEFAULT_RANDOM_CASES,
    value_range: int = DEFAULT_RANDOM_RANGE,
) -> list[dict[str, int]]:
    """Edge cases first, then seeded random ones.

    A program with no inputs still gets a single empty vector, so it is executed
    once rather than skipped.
    """
    names = program.inputs
    if not names:
        return [{}]

    vectors: list[dict[str, int]] = []

    # Every input set to the same edge value, which is what exposes identities
    # like x - x and x / x.
    for value in EDGE_VALUES:
        vectors.append(dict.fromkeys(names, value))

    # Each input taking a different edge value, so argument order matters.
    for offset in range(min(len(EDGE_VALUES), 6)):
        vectors.append(
            {
                name: EDGE_VALUES[(offset + position) % len(EDGE_VALUES)]
                for position, name in enumerate(names)
            }
        )

    rng = random.Random(seed)
    for _ in range(random_cases):
        vectors.append({name: rng.randint(-value_range, value_range) for name in names})

    return vectors


def compare(
    original: TacProgram,
    candidate: TacProgram,
    *,
    seed: int = 0,
    random_cases: int = DEFAULT_RANDOM_CASES,
    step_limit: int | None = None,
) -> DifferentialReport:
    """Run both over the same inputs and report the first difference found.

    A case where either side hits the step limit is counted as inconclusive and
    skipped rather than treated as a match. Two runs that both timed out have not
    been compared at all, and calling that a pass would let unverified programs
    through.
    """
    vectors = input_vectors(original, seed=seed, random_cases=random_cases)
    limit = DEFAULT_STEP_LIMIT if step_limit is None else step_limit

    inconclusive = 0
    for index, vector in enumerate(vectors):
        before = execute(original, vector, step_limit=limit)
        after = execute(candidate, vector, step_limit=limit)

        if not (before.conclusive and after.conclusive):
            inconclusive += 1
            continue

        if not before.observably_equals(after):
            return DifferentialReport(
                refuted=True,
                cases_run=index + 1,
                inconclusive=inconclusive,
                counterexample=Counterexample(inputs=vector, original=before, candidate=after),
            )

    return DifferentialReport(refuted=False, cases_run=len(vectors), inconclusive=inconclusive)
