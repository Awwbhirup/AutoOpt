"""Live variable analysis.

A variable is live at a point if some later path reads it before overwriting it.
Backward, may-analysis, so the meet is union.

Drives dead code elimination and dead store elimination: an assignment whose target
is not live afterwards computes something nobody reads.
"""

from __future__ import annotations

from dataclasses import dataclass

from ..ir.cfg import ControlFlowGraph
from .framework import Direction, solve, union


@dataclass(frozen=True, slots=True)
class Liveness:
    """Per instruction results, indexed the same way as the program."""

    live_before: tuple[frozenset[str], ...]
    live_after: tuple[frozenset[str], ...]

    def is_live_after(self, index: int, name: str) -> bool:
        return name in self.live_after[index]

    def is_dead_after(self, index: int, name: str) -> bool:
        return name not in self.live_after[index]


def analyse(cfg: ControlFlowGraph) -> Liveness:
    program = cfg.program
    size = len(program.instructions)

    def transfer(block_index: int, live_out: frozenset[str]) -> frozenset[str]:
        block = cfg.blocks[block_index]
        live = live_out
        # Walk the block backwards: kill what it defines, then add what it reads.
        for instruction in reversed(block.instructions):
            live = (live - instruction.defs) | instruction.uses
        return live

    # Nothing is live on the way out of the program. Inputs are not special here:
    # they are live at entry only if something actually reads them.
    empty: frozenset[str] = frozenset()
    _, block_live_in = solve(
        cfg,
        direction=Direction.BACKWARD,
        boundary=empty,
        initial=empty,
        meet=union,
        transfer=transfer,
    )

    live_before: list[frozenset[str]] = [frozenset()] * size
    live_after: list[frozenset[str]] = [frozenset()] * size

    for block in cfg.blocks:
        # Live-out of the block is the union of live-in over its successors, which
        # the solver already computed as those blocks' results.
        live = union(block_live_in[s] for s in cfg.successors(block.index))
        if not cfg.successors(block.index):
            live = frozenset()

        for offset in range(len(block.instructions) - 1, -1, -1):
            index = block.start + offset
            instruction = block.instructions[offset]
            live_after[index] = live
            live = (live - instruction.defs) | instruction.uses
            live_before[index] = live

    return Liveness(live_before=tuple(live_before), live_after=tuple(live_after))
