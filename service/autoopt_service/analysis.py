"""Source analysis for the editor."""

from __future__ import annotations

from typing import Literal

from autoopt.analysis import available_expressions, liveness, reaching
from autoopt.analysis.available import Fact, _transfer_instruction
from autoopt.ir import Goto, IfFalse, IfTrue, Label, build_cfg, source_to_tac
from autoopt.ir.cfg import BasicBlock, ControlFlowGraph

from .schemas import (
    AnalyzeBlock,
    AnalyzeEdge,
    AnalyzeResponse,
    AvailableFact,
    BlockFacts,
    TacLine,
)


def _available(facts: frozenset[Fact]) -> list[AvailableFact]:
    return [AvailableFact(expression=list(key), holder=holder) for key, holder in sorted(facts)]


def _edges(cfg: ControlFlowGraph) -> list[AnalyzeEdge]:
    block_for_label = {
        instruction.name: block.index
        for block in cfg.blocks
        for instruction in block.instructions
        if isinstance(instruction, Label)
    }
    edges: list[AnalyzeEdge] = []
    for block in cfg.blocks:
        last = block.instructions[-1]
        following = block.index + 1
        if isinstance(last, Goto):
            edges.append(
                AnalyzeEdge(source=block.index, target=block_for_label[last.target], kind="jump")
            )
        elif isinstance(last, IfFalse | IfTrue):
            branch_kind: Literal["true", "false"] = "false" if isinstance(last, IfFalse) else "true"
            fall_kind: Literal["true", "false"] = "true" if isinstance(last, IfFalse) else "false"
            edges.append(
                AnalyzeEdge(
                    source=block.index,
                    target=block_for_label[last.target],
                    kind=branch_kind,
                )
            )
            if following < len(cfg.blocks):
                edges.append(AnalyzeEdge(source=block.index, target=following, kind=fall_kind))
        elif following < len(cfg.blocks):
            edges.append(AnalyzeEdge(source=block.index, target=following, kind="fallthrough"))
    return edges


def _block(
    block: BasicBlock,
    cfg: ControlFlowGraph,
    live_before: tuple[frozenset[str], ...],
    live_after: tuple[frozenset[str], ...],
    reaching_before: tuple[frozenset[int], ...],
    reaching_defines: tuple[str | None, ...],
    available_before: tuple[frozenset[Fact], ...],
) -> AnalyzeBlock:
    first = block.start
    last = block.stop - 1
    reaching_out = set(reaching_before[last])
    defined = reaching_defines[last]
    if defined is not None:
        reaching_out = {site for site in reaching_out if reaching_defines[site] != defined}
        reaching_out.add(last)
    available_out = _transfer_instruction(available_before[last], cfg.program[last])

    return AnalyzeBlock(
        id=block.index,
        start=block.start,
        stop=block.stop,
        instructions=[
            TacLine(index=index, text=str(cfg.program[index]))
            for index in range(block.start, block.stop)
        ],
        reachable=block.index in cfg.reachable,
        loop_depth=cfg.loop_depth[block.index],
        facts=BlockFacts(
            live_in=sorted(live_before[first]),
            live_out=sorted(live_after[last]),
            reaching_in=sorted(reaching_before[first]),
            reaching_out=sorted(reaching_out),
            available_in=_available(available_before[first]),
            available_out=_available(available_out),
        ),
    )


def analyze(source: str) -> AnalyzeResponse:
    program = source_to_tac(source)
    cfg = build_cfg(program)
    live = liveness(cfg)
    definitions = reaching(cfg)
    expressions = available_expressions(cfg)
    return AnalyzeResponse(
        tac=[
            TacLine(index=index, text=str(instruction)) for index, instruction in enumerate(program)
        ],
        blocks=[
            _block(
                block,
                cfg,
                live.live_before,
                live.live_after,
                definitions.before,
                definitions.defines,
                expressions.before,
            )
            for block in cfg.blocks
        ],
        edges=_edges(cfg),
    )
