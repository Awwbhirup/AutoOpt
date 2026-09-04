"""Control flow graph over a TAC program.

The dataflow analyses need blocks and edges to iterate over. The cost model
needs loop_depth_per_instruction, since the spec weights cost by execution
time and an instruction in a nested loop costs more than the same one at top
level. Without that, LICM shows up as zero gain because it relocates an
instruction rather than removing it.

Derived on demand, never stored on the program, so a stale graph can't end up
describing code that already changed.
"""

from __future__ import annotations

from dataclasses import dataclass
from functools import cached_property

from .tac import Goto, Instruction, Label, TacProgram, is_terminator, jump_target


@dataclass(frozen=True, slots=True)
class BasicBlock:
    """A maximal straight-line run of instructions: one entry, one exit.

    `start` and `stop` index into the parent program, so a block can always be mapped
    back to the instructions a transformation needs to rewrite.
    """

    index: int
    start: int
    stop: int
    instructions: tuple[Instruction, ...]

    def __len__(self) -> int:
        return len(self.instructions)

    @property
    def is_empty(self) -> bool:
        return not self.instructions

    @property
    def terminator(self) -> Instruction | None:
        """The jump that ends this block, if it ends in one rather than falling through."""
        if self.instructions and is_terminator(self.instructions[-1]):
            return self.instructions[-1]
        return None

    def __str__(self) -> str:
        return f"B{self.index}[{self.start}:{self.stop}]"


class ControlFlowGraph:
    def __init__(self, program: TacProgram) -> None:
        self.program = program
        self.blocks: tuple[BasicBlock, ...] = ()
        self._successors: dict[int, set[int]] = {}
        self._predecessors: dict[int, set[int]] = {}
        self._build()

    # --- construction --------------------------------------------------------

    def _leaders(self) -> list[int]:
        """Instruction indices that begin a basic block.

        Three sources, per the standard rule: the first instruction, any jump target,
        and anything immediately following a jump.
        """
        code = self.program.instructions
        if not code:
            return []

        leaders: set[int] = {0}
        labels = self.program.labels

        for index, instruction in enumerate(code):
            target = jump_target(instruction)
            if target is not None:
                # The lowerer never emits a dangling jump, but a transformation
                # could, and a broken graph would be worse than an error here.
                if target not in labels:
                    raise ValueError(f"jump to undefined label {target!r} at instruction {index}")
                leaders.add(labels[target])
                if index + 1 < len(code):
                    leaders.add(index + 1)
            elif isinstance(instruction, Label):
                leaders.add(index)

        return sorted(leaders)

    def _build(self) -> None:
        code = self.program.instructions
        leaders = self._leaders()
        if not leaders:
            return

        bounds = list(zip(leaders, [*leaders[1:], len(code)], strict=True))
        self.blocks = tuple(
            BasicBlock(index=i, start=start, stop=stop, instructions=code[start:stop])
            for i, (start, stop) in enumerate(bounds)
        )

        block_at = {block.start: block.index for block in self.blocks}
        labels = self.program.labels

        self._successors = {block.index: set() for block in self.blocks}
        self._predecessors = {block.index: set() for block in self.blocks}

        for block in self.blocks:
            if block.is_empty:
                continue
            last = block.instructions[-1]
            target = jump_target(last)

            if target is not None:
                self._connect(block.index, block_at[labels[target]])

            # Everything except an unconditional jump can fall through to the next block.
            if not isinstance(last, Goto) and block.index + 1 < len(self.blocks):
                self._connect(block.index, block.index + 1)

    def _connect(self, source: int, destination: int) -> None:
        self._successors[source].add(destination)
        self._predecessors[destination].add(source)

    # --- graph queries -------------------------------------------------------

    def successors(self, block: int) -> frozenset[int]:
        return frozenset(self._successors.get(block, set()))

    def predecessors(self, block: int) -> frozenset[int]:
        return frozenset(self._predecessors.get(block, set()))

    @property
    def entry(self) -> int | None:
        return 0 if self.blocks else None

    @cached_property
    def reachable(self) -> frozenset[int]:
        """Blocks reachable from entry. The complement is what unreachable-code
        elimination is allowed to delete."""
        if self.entry is None:
            return frozenset()
        seen = {self.entry}
        stack = [self.entry]
        while stack:
            for successor in self._successors[stack.pop()]:
                if successor not in seen:
                    seen.add(successor)
                    stack.append(successor)
        return frozenset(seen)

    # --- dominance -----------------------------------------------------------

    @cached_property
    def dominators(self) -> dict[int, frozenset[int]]:
        """Iterate `Dom(n) = {n} + intersection of Dom(p) over predecessors` to a fixpoint.

        Unreachable blocks keep the full set. That is the usual outcome and is fine
        here, since back edge detection only looks at reachable blocks.
        """
        if self.entry is None:
            return {}

        every = frozenset(block.index for block in self.blocks)
        dominators: dict[int, frozenset[int]] = {
            block.index: (frozenset({self.entry}) if block.index == self.entry else every)
            for block in self.blocks
        }

        changed = True
        while changed:
            changed = False
            for block in self.blocks:
                if block.index == self.entry:
                    continue
                preds = self._predecessors[block.index]
                if not preds:
                    continue
                inherited = frozenset.intersection(*(dominators[p] for p in preds))
                updated = inherited | {block.index}
                if updated != dominators[block.index]:
                    dominators[block.index] = updated
                    changed = True

        return dominators

    def dominates(self, dominator: int, block: int) -> bool:
        return dominator in self.dominators.get(block, frozenset())

    # --- loops ---------------------------------------------------------------

    @cached_property
    def back_edges(self) -> tuple[tuple[int, int], ...]:
        """Edges `tail -> head` where the head dominates the tail. One per natural loop."""
        return tuple(
            (tail, head)
            for tail in sorted(self.reachable)
            for head in sorted(self._successors[tail])
            if self.dominates(head, tail)
        )

    @cached_property
    def natural_loops(self) -> tuple[frozenset[int], ...]:
        """For back edge `tail -> head`, the loop body is the head plus every block that
        reaches the tail without passing through the head."""
        loops: list[frozenset[int]] = []
        for tail, head in self.back_edges:
            body = {head, tail}
            stack = [tail] if tail != head else []
            while stack:
                for predecessor in self._predecessors[stack.pop()]:
                    if predecessor not in body:
                        body.add(predecessor)
                        stack.append(predecessor)
            loops.append(frozenset(body))
        return tuple(loops)

    @cached_property
    def loop_depth(self) -> dict[int, int]:
        """Block index to the number of natural loops containing it."""
        return {
            block.index: sum(1 for loop in self.natural_loops if block.index in loop)
            for block in self.blocks
        }

    @cached_property
    def loop_depth_per_instruction(self) -> tuple[int, ...]:
        """Nesting depth for each instruction, positionally aligned with the program.

        This is what the Cost Evaluator multiplies by: an instruction at depth d is
        assumed to execute proportionally more often than one at depth 0.
        """
        depths = [0] * len(self.program.instructions)
        for block in self.blocks:
            for index in range(block.start, block.stop):
                depths[index] = self.loop_depth[block.index]
        return tuple(depths)

    # --- presentation --------------------------------------------------------

    def format(self) -> str:
        lines: list[str] = []
        for block in self.blocks:
            successors = ", ".join(f"B{s}" for s in sorted(self._successors[block.index])) or "-"
            depth = self.loop_depth[block.index]
            marks = []
            if block.index not in self.reachable:
                marks.append("unreachable")
            if depth:
                marks.append(f"loop depth {depth}")
            suffix = f"  ({', '.join(marks)})" if marks else ""
            lines.append(f"B{block.index}  -> {successors}{suffix}")
            for offset, instruction in enumerate(block.instructions):
                lines.append(f"    {block.start + offset:>3}  {instruction}")
        return "\n".join(lines)

    def __str__(self) -> str:
        return self.format()


def build_cfg(program: TacProgram) -> ControlFlowGraph:
    return ControlFlowGraph(program)
