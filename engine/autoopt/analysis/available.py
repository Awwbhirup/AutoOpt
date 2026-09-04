"""Available expression analysis.

An expression is available at a point if every path to it computes the expression
and nothing since has redefined an operand. Forward, must-analysis, so the meet is
intersection.

Each fact pairs the expression with the variable currently holding its value, so
common subexpression elimination knows both that `a + b` is available and that the
result already sits in `t1`.
"""

from __future__ import annotations

from dataclasses import dataclass

from ..ir.cfg import ControlFlowGraph
from ..ir.tac import BinAssign, Instruction, Operand, UnAssign, Var
from .framework import Direction, intersection, solve

#: (operator, operands...) identifying a computation independent of where it lives.
ExprKey = tuple[str, ...]

#: An available expression together with the variable holding its result.
Fact = tuple[ExprKey, str]


def expression_of(instruction: Instruction) -> ExprKey | None:
    """The computation an instruction performs, or None if it computes nothing.

    Division and modulo are excluded. Reusing an earlier quotient would be valid,
    but it lets the trap move or disappear, and the verifier treats a program that
    stops trapping as a different program.
    """
    match instruction:
        case BinAssign(op=op, left=left, right=right) if instruction.is_pure:
            return (op.value, str(left), str(right))
        case UnAssign(op=op, operand=operand):
            return (op.value, str(operand))
        case _:
            return None


def _mentions(key: ExprKey, name: str) -> bool:
    return name in key[1:]


@dataclass(frozen=True, slots=True)
class Available:
    """Facts holding immediately before each instruction."""

    before: tuple[frozenset[Fact], ...]

    def holder_of(self, index: int, key: ExprKey) -> str | None:
        """The variable already holding `key` at this point, if any.

        Sorted, not just "first found". Facts live in a frozenset, and Python
        randomises string hashing per process, so iterating one unsorted would
        pick a different holder on different runs. That would make the whole
        pipeline non-reproducible, which the statistics layer cannot tolerate.
        """
        for available_key, holder in sorted(self.before[index]):
            if available_key == key:
                return holder
        return None


def _transfer_instruction(facts: frozenset[Fact], instruction: Instruction) -> frozenset[Fact]:
    key = expression_of(instruction)
    defined = instruction.defs

    if defined:
        target = next(iter(defined))
        # Redefining a variable invalidates anything computed from it, and anything
        # that was being held in it.
        facts = frozenset(
            fact for fact in facts if not _mentions(fact[0], target) and fact[1] != target
        )
        if key is not None and not _mentions(key, target):
            facts |= {(key, target)}

    return facts


def _universe(cfg: ControlFlowGraph) -> frozenset[Fact]:
    """Every fact the program could ever generate.

    Must-analyses have to start at the top of the lattice and descend. Starting
    from the empty set instead yields the least fixpoint, which is sound but
    erases everything at loop headers, because intersecting with a back edge whose
    output is still empty gives nothing. CSE would then never fire inside a loop.
    """
    facts: set[Fact] = set()
    for instruction in cfg.program.instructions:
        key = expression_of(instruction)
        if key is not None and instruction.defs:
            facts.add((key, next(iter(instruction.defs))))
    return frozenset(facts)


def analyse(cfg: ControlFlowGraph) -> Available:
    size = len(cfg.program.instructions)

    def transfer(block_index: int, incoming: frozenset[Fact]) -> frozenset[Fact]:
        facts = incoming
        for instruction in cfg.blocks[block_index].instructions:
            facts = _transfer_instruction(facts, instruction)
        return facts

    empty: frozenset[Fact] = frozenset()
    block_in, _ = solve(
        cfg,
        direction=Direction.FORWARD,
        boundary=empty,
        initial=_universe(cfg),
        meet=intersection,
        transfer=transfer,
    )

    before: list[frozenset[Fact]] = [frozenset()] * size
    for block in cfg.blocks:
        facts = block_in.get(block.index, frozenset())
        for offset, instruction in enumerate(block.instructions):
            before[block.start + offset] = facts
            facts = _transfer_instruction(facts, instruction)

    return Available(before=tuple(before))


def operands_of(instruction: Instruction) -> tuple[Operand, ...]:
    match instruction:
        case BinAssign(left=left, right=right):
            return (left, right)
        case UnAssign(operand=operand):
            return (operand,)
        case _:
            return ()


def reads_variable(instruction: Instruction, name: str) -> bool:
    return any(isinstance(op, Var) and op.name == name for op in operands_of(instruction))
