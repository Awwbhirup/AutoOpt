"""Constant propagation analysis.

Tracks which variables are known to hold a specific constant at each point.
Forward, must-analysis: a variable is only known constant if every path agrees on
the same value.

Facts are (name, value) pairs, so intersection does the right thing for free. If
two paths give a variable different values the pair drops out and the variable is
simply unknown, which is exactly the lattice behaviour wanted.

Feeds constant folding and constant propagation.
"""

from __future__ import annotations

from dataclasses import dataclass

from ..ir.cfg import ControlFlowGraph
from ..ir.tac import BinAssign, BinOp, Const, Copy, Instruction, Operand, UnAssign, UnOp, Var
from .framework import Direction, intersection, solve

Fact = tuple[str, int]

#: Cap on universe-growing rounds. Two or three is normal; the cap only guards
#: against a pathological program, and stopping early costs precision, not soundness.
_MAX_UNIVERSE_ROUNDS = 6


def fold_binary(op: BinOp, left: int, right: int) -> int | None:
    """Evaluate a binary op on two constants, mirroring the interpreter exactly.

    Returns None where the interpreter would trap, so folding never removes a trap
    the original program would have hit.
    """
    from ..interp.machine import _div, _mod

    match op:
        case BinOp.ADD:
            return left + right
        case BinOp.SUB:
            return left - right
        case BinOp.MUL:
            return left * right
        case BinOp.DIV:
            return None if right == 0 else _div(left, right)
        case BinOp.MOD:
            return None if right == 0 else _mod(left, right)
        case BinOp.LT:
            return int(left < right)
        case BinOp.GT:
            return int(left > right)
        case BinOp.LE:
            return int(left <= right)
        case BinOp.GE:
            return int(left >= right)
        case BinOp.EQ:
            return int(left == right)
        case BinOp.NE:
            return int(left != right)


def fold_unary(op: UnOp, value: int) -> int:
    return -value if op is UnOp.NEG else int(value == 0)


@dataclass(frozen=True, slots=True)
class Constants:
    """Known constant values immediately before each instruction."""

    before: tuple[frozenset[Fact], ...]

    def value_of(self, index: int, name: str) -> int | None:
        # Sorted for reproducibility; see Available.holder_of.
        for known_name, value in sorted(self.before[index]):
            if known_name == name:
                return value
        return None

    def resolve(self, index: int, operand: Operand) -> int | None:
        """The constant value of an operand here, whether literal or a known variable."""
        match operand:
            case Const(value=value):
                return value
            case Var(name=name):
                return self.value_of(index, name)


def _evaluate(facts: frozenset[Fact], instruction: Instruction) -> int | None:
    def lookup(operand: Operand) -> int | None:
        match operand:
            case Const(value=value):
                return value
            case Var(name=name):
                return next((v for n, v in facts if n == name), None)

    match instruction:
        case Copy(src=src):
            return lookup(src)
        case UnAssign(op=op, operand=operand):
            value = lookup(operand)
            return None if value is None else fold_unary(op, value)
        case BinAssign(op=op, left=left, right=right):
            left_value, right_value = lookup(left), lookup(right)
            if left_value is None or right_value is None:
                return None
            return fold_binary(op, left_value, right_value)
        case _:
            return None


def _transfer_instruction(facts: frozenset[Fact], instruction: Instruction) -> frozenset[Fact]:
    defined = instruction.defs
    if not defined:
        return facts

    target = next(iter(defined))
    facts = frozenset(fact for fact in facts if fact[0] != target)

    value = _evaluate(facts, instruction)
    return facts if value is None else facts | {(target, value)}


def analyse(cfg: ControlFlowGraph) -> Constants:
    size = len(cfg.program.instructions)

    def transfer(block_index: int, incoming: frozenset[Fact]) -> frozenset[Fact]:
        facts = incoming
        for instruction in cfg.blocks[block_index].instructions:
            facts = _transfer_instruction(facts, instruction)
        return facts

    # Inputs are unknown at entry, so the boundary is empty.
    empty: frozenset[Fact] = frozenset()

    # Like the other must-analyses this has to start from the top of the lattice,
    # or a loop header intersecting with an as-yet-empty back edge erases
    # everything and constants never propagate into loop bodies.
    #
    # Unlike available expressions, the reachable (name, value) pairs are not
    # known up front: which constants exist depends on what folding derives. So
    # grow the universe until it stops changing. Each round starts higher than the
    # last and still descends to a fixpoint, so every round is sound, and in
    # practice this settles in two or three.
    universe: frozenset[Fact] = empty
    block_in: dict[int, frozenset[Fact]] = {}

    for _ in range(_MAX_UNIVERSE_ROUNDS):
        block_in, block_out = solve(
            cfg,
            direction=Direction.FORWARD,
            boundary=empty,
            initial=universe,
            meet=intersection,
            transfer=transfer,
        )
        discovered = universe.union(*block_out.values()) if block_out else universe
        if discovered == universe:
            break
        universe = discovered

    before: list[frozenset[Fact]] = [frozenset()] * size
    for block in cfg.blocks:
        facts = block_in.get(block.index, frozenset())
        for offset, instruction in enumerate(block.instructions):
            before[block.start + offset] = facts
            facts = _transfer_instruction(facts, instruction)

    return Constants(before=tuple(before))
