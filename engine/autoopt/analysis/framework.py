"""Generic iterative dataflow solver.

All four analyses are the same algorithm with different parameters, so they share
one worklist solver rather than repeating the fixpoint loop four times.

A solver instance needs:

- a direction, forward or backward
- an initial value for the entry (or exit) block
- a meet operator to combine values arriving from several edges
- a transfer function taking a block's input to its output

Results come back per block. Transformations usually need per instruction facts,
so each analysis also walks its blocks afterwards to produce those.
"""

from __future__ import annotations

from collections.abc import Callable, Iterable
from enum import Enum, auto

from ..ir.cfg import ControlFlowGraph


class Direction(Enum):
    FORWARD = auto()
    BACKWARD = auto()


def solve[T](
    cfg: ControlFlowGraph,
    *,
    direction: Direction,
    boundary: T,
    initial: T,
    meet: Callable[[Iterable[T]], T],
    transfer: Callable[[int, T], T],
) -> tuple[dict[int, T], dict[int, T]]:
    """Iterate to a fixpoint and return (inputs, outputs) keyed by block index.

    `boundary` is the value at the entry block for a forward analysis, or at the
    exit blocks for a backward one. `initial` seeds every other block.

    For a forward analysis "input" means the value arriving at the top of a block.
    For a backward one it means the value arriving at the bottom, so callers read
    the pair in the direction the analysis runs.
    """
    forward = direction is Direction.FORWARD
    blocks = [block.index for block in cfg.blocks]
    if not blocks:
        return {}, {}

    # Sources are where the boundary value enters: the entry block going forward,
    # or any block with no successors going backward.
    if forward:
        sources = {cfg.entry} if cfg.entry is not None else set()
        incoming = cfg.predecessors
    else:
        sources = {b for b in blocks if not cfg.successors(b)}
        incoming = cfg.successors

    inputs: dict[int, T] = {b: (boundary if b in sources else initial) for b in blocks}
    outputs: dict[int, T] = {b: initial for b in blocks}

    # Forward analyses converge fastest in block order, backward ones in reverse.
    order = blocks if forward else list(reversed(blocks))
    worklist = list(order)
    queued = set(worklist)

    while worklist:
        block = worklist.pop(0)
        queued.discard(block)

        neighbours = incoming(block)
        if neighbours:
            arriving = meet(outputs[n] for n in neighbours)
            inputs[block] = meet([arriving, boundary]) if block in sources else arriving

        result = transfer(block, inputs[block])
        if result == outputs[block]:
            continue

        outputs[block] = result
        propagate_to = cfg.successors(block) if forward else cfg.predecessors(block)
        for neighbour in propagate_to:
            if neighbour not in queued:
                worklist.append(neighbour)
                queued.add(neighbour)

    return inputs, outputs


def union[T](values: Iterable[frozenset[T]]) -> frozenset[T]:
    """Meet for may-analyses: a fact holds if it holds on any incoming path."""
    result: frozenset[T] = frozenset()
    for value in values:
        result |= value
    return result


def intersection[T](values: Iterable[frozenset[T]]) -> frozenset[T]:
    """Meet for must-analyses: a fact holds only if it holds on every path.

    An empty sequence means the block has no predecessors, so nothing is known.
    """
    collected = list(values)
    if not collected:
        return frozenset()
    return frozenset.intersection(*collected)
