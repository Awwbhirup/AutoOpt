"""Cost Evaluator.

The spec names four terms (instruction count, arithmetic ops, temporaries,
execution time) and says to normalise before weighting, but gives no weights.
Project 3 on the same handout gives 0.4 / 0.3 / 0.2 / 0.1, which is what the
bootstrap run uses.

Weights are a parameter, never a module constant, because the plan is to fit them
from the corpus rather than assume them: regress measured interpreter steps on the
four terms across all 500 programs and take the standardised coefficients. That
cannot happen until the corpus exists, so the handout weights get us there and the
derived ones replace them afterwards.

Normalisation is against the original program, so the original always scores 1.0
and cost reduction reads directly as 1 - cost. Terms are unitless after that,
which is the only way adding an instruction count to an execution estimate means
anything.

Execution time is estimated statically as 10^loop_depth per instruction rather
than timed with a clock. Wall clock would be noisy and would break the seeded
reproducibility the whole statistics layer depends on. The loop depth comes from
the CFG.
"""

from __future__ import annotations

import re
from dataclasses import dataclass

from ..ir.cfg import ControlFlowGraph, build_cfg
from ..ir.tac import BinAssign, BinOp, TacProgram, UnAssign

#: Operators that count toward the arithmetic term. Comparisons are excluded:
#: the spec's wording is "arithmetic ops", and a comparison is not one.
ARITHMETIC_OPS = frozenset({BinOp.ADD, BinOp.SUB, BinOp.MUL, BinOp.DIV, BinOp.MOD})

#: Temporaries introduced by lowering, as opposed to source-level variables.
TEMP_PATTERN = re.compile(r"^t\d+$")

#: Assumed trip count per loop nesting level. Standard textbook figure, and the
#: exact value matters less than that deeper loops dominate shallower ones.
TRIP_COUNT = 10

#: Relative latency per operation, used only by the execution estimate.
#:
#: The arithmetic term stays a raw count, as Project 3 defines it. Operator cost
#: belongs here instead, in the term the spec leaves undefined, because a multiply
#: really does take longer than an add. Without this, strength reduction can never
#: be accepted: n * 2 and n + n have identical instruction, arithmetic and
#: temporary counts, so the cost gate would reject a transformation the spec
#: explicitly asks for.
OP_LATENCY: dict[BinOp, int] = {
    BinOp.MUL: 3,
    BinOp.DIV: 5,
    BinOp.MOD: 5,
}
DEFAULT_LATENCY = 1


@dataclass(frozen=True, slots=True)
class CostWeights:
    """Bootstrap values come from Project 3 on the same handout."""

    instructions: float = 0.4
    arithmetic: float = 0.3
    temporaries: float = 0.2
    execution: float = 0.1

    def as_tuple(self) -> tuple[float, float, float, float]:
        return (self.instructions, self.arithmetic, self.temporaries, self.execution)


@dataclass(frozen=True, slots=True)
class RawCost:
    """The four raw measurements, before normalisation or weighting."""

    instruction_count: int
    arithmetic_ops: int
    temp_vars: int
    execution_estimate: float

    def as_tuple(self) -> tuple[float, float, float, float]:
        return (
            float(self.instruction_count),
            float(self.arithmetic_ops),
            float(self.temp_vars),
            self.execution_estimate,
        )


@dataclass(frozen=True, slots=True)
class Cost:
    """A scored program. `total` is comparable only against costs sharing a reference."""

    raw: RawCost
    total: float

    def __lt__(self, other: Cost) -> bool:
        return self.total < other.total


def measure(program: TacProgram, cfg: ControlFlowGraph | None = None) -> RawCost:
    """The four raw terms. Builds a CFG if one is not supplied."""
    graph = cfg if cfg is not None else build_cfg(program)
    depths = graph.loop_depth_per_instruction

    arithmetic = 0
    temporaries: set[str] = set()
    execution = 0.0

    for index, instruction in enumerate(program.instructions):
        match instruction:
            case BinAssign(op=op) if op in ARITHMETIC_OPS:
                arithmetic += 1
            case UnAssign():
                arithmetic += 1
            case _:
                pass

        temporaries.update(name for name in instruction.defs if TEMP_PATTERN.match(name))

        latency = (
            OP_LATENCY.get(instruction.op, DEFAULT_LATENCY)
            if isinstance(instruction, BinAssign)
            else DEFAULT_LATENCY
        )
        execution += float(latency * TRIP_COUNT ** depths[index])

    return RawCost(
        instruction_count=len(program.instructions),
        arithmetic_ops=arithmetic,
        temp_vars=len(temporaries),
        execution_estimate=execution,
    )


class CostModel:
    """Scores programs relative to one original.

    Every candidate in a run is scored against the same reference, so totals are
    comparable within a run. They are not comparable across programs, which is
    fine: the reported figure is percentage reduction, not absolute cost.
    """

    def __init__(self, reference: RawCost, weights: CostWeights | None = None) -> None:
        self.reference = reference
        self.weights = weights or CostWeights()

        # A term the original scores zero on cannot be normalised, and it also
        # cannot be improved. Drop those and share their weight out over the rest,
        # so the original always scores exactly 1.0 and reduction still reads as
        # 1 - cost. Leaving them in at zero would drag every score down by a
        # constant and make a program with no arithmetic look pre-optimised.
        raw = reference.as_tuple()
        weight_values = self.weights.as_tuple()
        active = [index for index, value in enumerate(raw) if value > 0]
        total_weight = sum(weight_values[index] for index in active)

        self._terms: tuple[tuple[int, float, float], ...] = tuple(
            (index, weight_values[index] / total_weight, raw[index]) for index in active
        )
        if not self._terms:
            self._terms = ()

    @classmethod
    def for_program(cls, program: TacProgram, weights: CostWeights | None = None) -> CostModel:
        return cls(measure(program), weights)

    def score(self, program: TacProgram, cfg: ControlFlowGraph | None = None) -> Cost:
        return self.of(measure(program, cfg))

    def of(self, raw: RawCost) -> Cost:
        values = raw.as_tuple()
        total = sum(weight * values[index] / divisor for index, weight, divisor in self._terms)
        return Cost(raw=raw, total=total)

    def reduction(self, cost: Cost) -> float:
        """Fraction saved against the original, which is the spec's Cost Reduction metric."""
        baseline = self.of(self.reference).total
        if baseline == 0:
            return 0.0
        return (baseline - cost.total) / baseline
