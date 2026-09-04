"""Turning analysis results into working memory facts.

This is the only place that knows about both the analyses and the rule engine.
Rules see facts and nothing else, so they never reach back into a dataflow result.
"""

from __future__ import annotations

from ..analysis import (
    Constants,
    Reaching,
    available_expressions,
    constants,
    copies,
    expression_of,
    liveness,
    reaching,
)
from ..ir.cfg import ControlFlowGraph
from ..ir.tac import BinAssign, BinOp, Const, Copy, Instruction, UnAssign, Var
from .engine import WorkingMemory


def _operand_facts(memory: WorkingMemory, index: int, instruction: Instruction) -> None:
    """reads(index, name) for every variable the instruction consumes."""
    for name in sorted(instruction.uses):
        memory.assert_fact("reads", index, name)


def build(cfg: ControlFlowGraph) -> WorkingMemory:
    """Run every analysis and assert what it found."""
    memory = WorkingMemory()
    program = cfg.program

    live = liveness(cfg)
    available = available_expressions(cfg)
    known = constants(cfg)
    copied = copies(cfg)
    reached = reaching(cfg)
    depths = cfg.loop_depth_per_instruction

    for index, instruction in enumerate(program.instructions):
        _operand_facts(memory, index, instruction)

        if instruction.is_pure:
            memory.assert_fact("pure", index)

        if depths[index]:
            memory.assert_fact("in_loop", index, depths[index])

        for name in sorted(instruction.defs):
            memory.assert_fact("defines", index, name)
            if live.is_dead_after(index, name):
                memory.assert_fact("dead_after", name, index)

        # What this instruction computes, and whether something already holds it.
        key = expression_of(instruction)
        if key is not None:
            memory.assert_fact("computes", index, "|".join(key))
            holder = available.holder_of(index, key)
            if holder is not None and holder not in instruction.defs:
                memory.assert_fact("available", index, "|".join(key), holder)

        # Constant operands, and whether the whole instruction folds.
        folded = _fold(known, index, instruction)
        if folded is not None:
            memory.assert_fact("foldable", index, folded)

        for name in sorted(instruction.uses):
            value = known.value_of(index, name)
            if value is not None:
                memory.assert_fact("is_const", name, value, index)

            source = copied.source_of(index, name)
            if source is not None:
                memory.assert_fact("copy_of", name, source, index)

        pattern = _algebraic_pattern(instruction)
        if pattern is not None:
            memory.assert_fact("algebraic", index, pattern)

        if _is_doubling(instruction):
            memory.assert_fact("strength_reducible", index, "mul_by_two")

        # Loop invariance: every definition reaching an operand sits outside the
        # loop this instruction is in.
        if depths[index] and key is not None and _is_invariant(cfg, reached, index, instruction):
            memory.assert_fact("loop_invariant", index, depths[index])

    return memory


def _algebraic_pattern(instruction: Instruction) -> str | None:
    """Identity that simplifies away regardless of what the operands hold.

    These hold for any value, so unlike constant folding they need no analysis.
    """
    if not isinstance(instruction, BinAssign):
        return None

    left, right, op = instruction.left, instruction.right, instruction.op
    zero_left = isinstance(left, Const) and left.value == 0
    zero_right = isinstance(right, Const) and right.value == 0
    one_left = isinstance(left, Const) and left.value == 1
    one_right = isinstance(right, Const) and right.value == 1

    match op:
        case BinOp.ADD if zero_right or zero_left:
            return "add_zero"
        case BinOp.SUB if zero_right:
            return "sub_zero"
        case BinOp.SUB if left == right and isinstance(left, Var):
            return "self_subtract"
        case BinOp.MUL if one_right or one_left:
            return "mul_one"
        case BinOp.MUL if zero_right or zero_left:
            return "mul_zero"
        case BinOp.DIV if one_right:
            return "div_one"
        case _:
            return None


def _is_doubling(instruction: Instruction) -> bool:
    """x * 2, which becomes x + x. The spec's own strength-reduction example."""
    if not isinstance(instruction, BinAssign) or instruction.op is not BinOp.MUL:
        return False
    left, right = instruction.left, instruction.right
    return (isinstance(right, Const) and right.value == 2 and isinstance(left, Var)) or (
        isinstance(left, Const) and left.value == 2 and isinstance(right, Var)
    )


def _fold(known: Constants, index: int, instruction: Instruction) -> int | None:
    """The constant this instruction evaluates to, if every operand is known.

    Skips instructions that already are a constant copy, since folding one of
    those changes nothing.
    """
    from ..analysis import fold_binary, fold_unary

    match instruction:
        case BinAssign(op=op, left=left, right=right):
            left_value = known.resolve(index, left)
            right_value = known.resolve(index, right)
            if left_value is None or right_value is None:
                return None
            return fold_binary(op, left_value, right_value)
        case UnAssign(op=op, operand=operand):
            value = known.resolve(index, operand)
            return None if value is None else fold_unary(op, value)
        case Copy(src=Var()):
            resolved: int | None = known.resolve(index, instruction.src)
            return resolved
        case _:
            return None


def _is_invariant(
    cfg: ControlFlowGraph,
    reached: Reaching,
    index: int,
    instruction: Instruction,
) -> bool:
    """True when nothing the instruction reads is redefined inside its loop."""
    loops = [loop for loop in cfg.natural_loops if _block_of(cfg, index) in loop]
    if not loops:
        return False

    # Use the innermost loop containing the instruction.
    body = min(loops, key=len)
    inside = {
        position
        for block_index in body
        for position in range(cfg.blocks[block_index].start, cfg.blocks[block_index].stop)
    }

    inputs = set(cfg.program.inputs)
    for name in instruction.uses:
        definitions = reached.definitions_of(index, name)
        if not definitions:
            # An input has no defining instruction anywhere, so nothing in the
            # loop can change it. Anything else with no reaching definition is
            # something the analysis could not account for, so stay conservative.
            if name in inputs:
                continue
            return False
        if any(site in inside for site in definitions):
            return False
    return True


def _block_of(cfg: ControlFlowGraph, index: int) -> int:
    for block in cfg.blocks:
        if block.start <= index < block.stop:
            return block.index
    return -1


def describe(memory: WorkingMemory) -> str:
    """Readable dump of working memory, for the decision log and for debugging."""
    lines: list[str] = []
    for predicate in memory.predicates:
        for fact in memory.query(predicate):
            lines.append(str(fact))
    return "\n".join(lines)


__all__ = ["build", "describe"]
