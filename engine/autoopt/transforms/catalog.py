"""The eight transformations.

Each one re-checks its own preconditions before rewriting. The opportunity that
triggered it came from an earlier snapshot of the program, and by the time it is
applied another transformation may have changed the instruction underneath it.
Checking again is cheaper than reasoning about staleness, and returning None
loses nothing: the orchestrator just records a rejection and moves on.
"""

from __future__ import annotations

from ..events import OptimizationType as Kind
from ..ir.cfg import build_cfg
from ..ir.tac import BinAssign, BinOp, Const, Copy, TacProgram, UnAssign, Var
from ..rules import Opportunity
from .base import (
    Transformation,
    moved_instruction,
    substitute,
    with_instruction,
    without_instruction,
)


class DeadCodeElimination(Transformation):
    kind = Kind.DEAD_CODE_ELIMINATION
    name = "dead-code-elimination"
    preconditions = "instruction defines x, x is not live afterwards, instruction is pure"
    effects = "instruction removed"

    def apply(self, program: TacProgram, opportunity: Opportunity) -> TacProgram | None:
        if not self._valid_site(program, opportunity):
            return None
        instruction = program[opportunity.site]
        if not instruction.defs or not instruction.is_pure:
            return None
        return without_instruction(program, opportunity.site)


class ConstantFolding(Transformation):
    kind = Kind.CONSTANT_FOLDING
    name = "constant-folding"
    preconditions = "instruction computes, every operand is a known constant"
    effects = "instruction replaced by a copy of the computed value"

    def apply(self, program: TacProgram, opportunity: Opportunity) -> TacProgram | None:
        if not self._valid_site(program, opportunity):
            return None
        instruction = program[opportunity.site]
        if not isinstance(instruction, BinAssign | UnAssign):
            return None

        value = opportunity.detail.get("value")
        if value is None:
            return None
        return with_instruction(
            program, opportunity.site, Copy(dst=instruction.dst, src=Const(int(value)))
        )


class AlgebraicSimplification(Transformation):
    kind = Kind.ALGEBRAIC_SIMPLIFICATION
    name = "algebraic-simplification"
    preconditions = "instruction matches an identity that holds for every operand value"
    effects = "instruction replaced by a copy or a constant"

    def apply(self, program: TacProgram, opportunity: Opportunity) -> TacProgram | None:
        if not self._valid_site(program, opportunity):
            return None
        instruction = program[opportunity.site]
        if not isinstance(instruction, BinAssign):
            return None

        left, right, pattern = (
            instruction.left,
            instruction.right,
            opportunity.detail.get("pattern"),
        )

        def keep(operand: object) -> TacProgram | None:
            if not isinstance(operand, Const | Var):
                return None
            return with_instruction(
                program, opportunity.site, Copy(dst=instruction.dst, src=operand)
            )

        def constant(value: int) -> TacProgram:
            return with_instruction(
                program, opportunity.site, Copy(dst=instruction.dst, src=Const(value))
            )

        zero_left = isinstance(left, Const) and left.value == 0
        one_left = isinstance(left, Const) and left.value == 1

        match pattern:
            case "add_zero":
                return keep(right if zero_left else left)
            case "sub_zero":
                return keep(left)
            case "self_subtract":
                return constant(0)
            case "mul_one":
                return keep(right if one_left else left)
            case "mul_zero":
                return constant(0)
            case "div_one":
                return keep(left)
            case _:
                return None


class StrengthReduction(Transformation):
    kind = Kind.STRENGTH_REDUCTION
    name = "strength-reduction"
    preconditions = "instruction multiplies a variable by two"
    effects = "multiplication replaced by addition of the operand to itself"

    def apply(self, program: TacProgram, opportunity: Opportunity) -> TacProgram | None:
        if not self._valid_site(program, opportunity):
            return None
        instruction = program[opportunity.site]
        if not isinstance(instruction, BinAssign) or instruction.op is not BinOp.MUL:
            return None

        left, right = instruction.left, instruction.right
        variable = left if isinstance(left, Var) else right
        if not isinstance(variable, Var):
            return None

        return with_instruction(
            program,
            opportunity.site,
            BinAssign(dst=instruction.dst, op=BinOp.ADD, left=variable, right=variable),
        )


class ConstantPropagation(Transformation):
    kind = Kind.CONSTANT_PROPAGATION
    name = "constant-propagation"
    preconditions = "instruction reads x, x holds a known constant here"
    effects = "the read of x replaced by the constant"

    def apply(self, program: TacProgram, opportunity: Opportunity) -> TacProgram | None:
        if not self._valid_site(program, opportunity):
            return None
        name = opportunity.detail.get("variable")
        value = opportunity.detail.get("value")
        if name is None or value is None:
            return None

        instruction = program[opportunity.site]
        if name not in instruction.uses:
            return None

        rewritten = substitute(instruction, str(name), Const(int(value)))
        if rewritten == instruction:
            return None
        return with_instruction(program, opportunity.site, rewritten)


class CopyPropagation(Transformation):
    kind = Kind.COPY_PROPAGATION
    name = "copy-propagation"
    preconditions = "instruction reads x, x holds the same value as y here"
    effects = "the read of x replaced by y"

    def apply(self, program: TacProgram, opportunity: Opportunity) -> TacProgram | None:
        if not self._valid_site(program, opportunity):
            return None
        name = opportunity.detail.get("variable")
        source = opportunity.detail.get("source")
        if name is None or source is None:
            return None

        instruction = program[opportunity.site]
        if name not in instruction.uses:
            return None

        rewritten = substitute(instruction, str(name), Var(str(source)))
        if rewritten == instruction:
            return None
        return with_instruction(program, opportunity.site, rewritten)


class CommonSubexpressionElimination(Transformation):
    kind = Kind.COMMON_SUBEXPRESSION_ELIMINATION
    name = "common-subexpression-elimination"
    preconditions = "instruction computes e, e is already available in y"
    effects = "computation replaced by a copy from y"

    def apply(self, program: TacProgram, opportunity: Opportunity) -> TacProgram | None:
        if not self._valid_site(program, opportunity):
            return None
        holder = opportunity.detail.get("holder")
        if holder is None:
            return None

        instruction = program[opportunity.site]
        if not isinstance(instruction, BinAssign | UnAssign):
            return None
        # Copying a variable into itself would be a no-op that the cost model
        # then rejects, so skip it rather than proposing it.
        if str(holder) == instruction.dst:
            return None

        return with_instruction(
            program, opportunity.site, Copy(dst=instruction.dst, src=Var(str(holder)))
        )


class LoopInvariantCodeMotion(Transformation):
    kind = Kind.LOOP_INVARIANT_CODE_MOTION
    name = "loop-invariant-code-motion"
    preconditions = "instruction is inside a loop, pure, and reads nothing the loop redefines"
    effects = "instruction relocated to immediately before the loop header"

    def apply(self, program: TacProgram, opportunity: Opportunity) -> TacProgram | None:
        if not self._valid_site(program, opportunity):
            return None
        instruction = program[opportunity.site]
        if not instruction.is_pure or not instruction.defs:
            return None

        cfg = build_cfg(program)
        site_block = next(
            (b.index for b in cfg.blocks if b.start <= opportunity.site < b.stop), None
        )
        if site_block is None:
            return None

        # Innermost enclosing loop. Hoisting only to the inner header is correct:
        # if the code is also invariant in an outer loop, a later iteration of the
        # agent loop will lift it again.
        headers = [head for _, head in cfg.back_edges]
        enclosing = [
            (loop, headers[position])
            for position, loop in enumerate(cfg.natural_loops)
            if site_block in loop
        ]
        if not enclosing:
            return None

        _, header = min(enclosing, key=lambda pair: len(pair[0]))
        destination = cfg.blocks[header].start
        if destination >= opportunity.site:
            return None

        return moved_instruction(program, opportunity.site, destination)


def default_transformations() -> dict[Kind, Transformation]:
    """The catalog, keyed by the opportunity kind that selects it."""
    catalog: list[Transformation] = [
        DeadCodeElimination(),
        ConstantFolding(),
        AlgebraicSimplification(),
        StrengthReduction(),
        ConstantPropagation(),
        CopyPropagation(),
        CommonSubexpressionElimination(),
        LoopInvariantCodeMotion(),
    ]
    return {transformation.kind: transformation for transformation in catalog}
