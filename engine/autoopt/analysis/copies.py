"""Available copy analysis.

Tracks pairs (x, y) meaning x definitely holds the same value as y at this point.
Forward, must-analysis.

Lowering produces a lot of these, since every intermediate value lands in a fresh
temporary before being copied into its real destination. Copy propagation rewrites
later uses of x to use y instead, which in turn makes the copy itself dead and
gives dead code elimination something to remove.
"""

from __future__ import annotations

from dataclasses import dataclass

from ..ir.cfg import ControlFlowGraph
from ..ir.tac import Copy, Instruction, Var
from .framework import Direction, intersection, solve

#: (destination, source) - the destination currently mirrors the source.
Fact = tuple[str, str]


@dataclass(frozen=True, slots=True)
class Copies:
    before: tuple[frozenset[Fact], ...]

    def source_of(self, index: int, name: str) -> str | None:
        """The variable `name` is a copy of here, if it is one.

        Sorted for reproducibility; see Available.holder_of.
        """
        for destination, source in sorted(self.before[index]):
            if destination == name:
                return source
        return None


def _transfer_instruction(facts: frozenset[Fact], instruction: Instruction) -> frozenset[Fact]:
    defined = instruction.defs
    if not defined:
        return facts

    target = next(iter(defined))
    # Redefining a variable breaks every copy relationship it took part in, on
    # either side of the pair.
    facts = frozenset(fact for fact in facts if target not in fact)

    if isinstance(instruction, Copy) and isinstance(instruction.src, Var):
        source = instruction.src.name
        if source != target:
            facts |= {(target, source)}

    return facts


def _universe(cfg: ControlFlowGraph) -> frozenset[Fact]:
    """Every copy the program could establish. See available.py for why a
    must-analysis has to start from the top rather than from the empty set."""
    facts: set[Fact] = set()
    for instruction in cfg.program.instructions:
        if isinstance(instruction, Copy) and isinstance(instruction.src, Var):
            target = next(iter(instruction.defs))
            if instruction.src.name != target:
                facts.add((target, instruction.src.name))
    return frozenset(facts)


def analyse(cfg: ControlFlowGraph) -> Copies:
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

    return Copies(before=tuple(before))
