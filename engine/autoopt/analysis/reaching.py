"""Reaching definition analysis.

A definition reaches a point if some path gets there without the variable being
redefined on the way. Forward, may-analysis, so the meet is union.

Facts are instruction indices, which makes it easy to ask which assignments could
be supplying the value a use sees. Loop invariance uses this: an expression is
invariant when every definition reaching its operands sits outside the loop.
"""

from __future__ import annotations

from dataclasses import dataclass

from ..ir.cfg import ControlFlowGraph
from ..ir.tac import Instruction
from .framework import Direction, solve, union


@dataclass(frozen=True, slots=True)
class Reaching:
    """Definition sites reaching the point immediately before each instruction."""

    before: tuple[frozenset[int], ...]
    defines: tuple[str | None, ...]

    def definitions_of(self, index: int, name: str) -> frozenset[int]:
        """Which instructions could be supplying `name` at this point."""
        return frozenset(site for site in self.before[index] if self.defines[site] == name)


def _target(instruction: Instruction) -> str | None:
    defined = instruction.defs
    return next(iter(defined)) if defined else None


def analyse(cfg: ControlFlowGraph) -> Reaching:
    program = cfg.program
    size = len(program.instructions)
    defines = tuple(_target(instruction) for instruction in program.instructions)

    def step(facts: frozenset[int], index: int) -> frozenset[int]:
        target = defines[index]
        if target is None:
            return facts
        # This definition kills every earlier one of the same variable.
        return frozenset(site for site in facts if defines[site] != target) | {index}

    def transfer(block_index: int, incoming: frozenset[int]) -> frozenset[int]:
        block = cfg.blocks[block_index]
        facts = incoming
        for offset in range(len(block.instructions)):
            facts = step(facts, block.start + offset)
        return facts

    empty: frozenset[int] = frozenset()
    block_in, _ = solve(
        cfg,
        direction=Direction.FORWARD,
        boundary=empty,
        initial=empty,
        meet=union,
        transfer=transfer,
    )

    before: list[frozenset[int]] = [frozenset()] * size
    for block in cfg.blocks:
        facts = block_in.get(block.index, frozenset())
        for offset in range(len(block.instructions)):
            index = block.start + offset
            before[index] = facts
            facts = step(facts, index)

    return Reaching(before=tuple(before), defines=defines)
