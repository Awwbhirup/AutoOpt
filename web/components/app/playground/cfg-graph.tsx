"use client";

/**
 * The control-flow graph of the program in the editor. Blocks in program
 * order, the fall-through edge straight down, other jumps routed round the
 * sides; true and false exits carry their colour and a letter. Selecting a
 * block (click or Enter) shows its facts in the other tabs.
 */

import { useMemo } from "react";

import { BLOCK_WIDTH, layoutCfg, SHOWN_LINES } from "@/lib/playground/cfg-layout";

import type { Analysis } from "./types";

const EDGE_COLOUR = {
  true: "var(--accent)",
  false: "var(--refused)",
  jump: "var(--muted)",
  fallthrough: "var(--muted)",
} as const;

export function CfgGraph({
  analysis,
  selected,
  onSelect,
}: {
  analysis: Analysis;
  selected: number | null;
  onSelect: (id: number) => void;
}) {
  const layout = useMemo(
    () =>
      layoutCfg(
        analysis.blocks.map((block) => ({ id: block.id, lines: block.instructions.length })),
        analysis.edges,
      ),
    [analysis],
  );
  const byId = new Map(analysis.blocks.map((block) => [block.id, block]));

  return (
    <div className="overflow-x-auto overscroll-x-contain" data-lenis-prevent>
      <svg
        width={layout.width}
        height={layout.height}
        viewBox={`0 0 ${layout.width} ${layout.height}`}
        role="img"
        aria-label={`Control-flow graph: ${analysis.blocks.length} blocks, ${analysis.edges.length} edges`}
        className="mx-auto block font-terminal"
      >
        <defs>
          {(["true", "false", "jump"] as const).map((kind) => (
            <marker key={kind} id={`arrow-${kind}`} viewBox="0 0 8 8" refX="7" refY="4" markerWidth="7" markerHeight="7" orient="auto">
              <path d="M0 0 L8 4 L0 8 z" fill={EDGE_COLOUR[kind]} />
            </marker>
          ))}
        </defs>

        {layout.edges.map((edge, index) => (
          <g key={index}>
            <path
              d={edge.d}
              fill="none"
              stroke={EDGE_COLOUR[edge.kind]}
              strokeWidth={edge.side === "left" ? 1.75 : 1.5}
              strokeDasharray={edge.side === "left" ? "4 3" : undefined}
              markerEnd={`url(#arrow-${edge.kind === "fallthrough" ? "jump" : edge.kind})`}
              opacity={selected === null || selected === edge.source || selected === edge.target ? 1 : 0.35}
            >
              <title>{`B${edge.source} to B${edge.target}, ${edge.kind}${edge.side === "left" ? " (back edge)" : ""}`}</title>
            </path>
            {edge.kind === "true" || edge.kind === "false" ? (
              <text
                x={edge.label.x}
                y={edge.label.y}
                fontSize="11"
                fill={EDGE_COLOUR[edge.kind]}
                textAnchor={edge.side === "left" ? "end" : "start"}
              >
                {edge.kind === "true" ? "T" : "F"}
              </text>
            ) : null}
          </g>
        ))}

        {layout.blocks.map((placed) => {
          const block = byId.get(placed.id);
          if (block === undefined) return null;
          const active = selected === placed.id;
          const extra = block.instructions.length - SHOWN_LINES;
          return (
            <g
              key={placed.id}
              transform={`translate(${placed.x} ${placed.y})`}
              role="button"
              tabIndex={0}
              aria-pressed={active}
              aria-label={`Block ${placed.id}, ${block.instructions.length} instructions`}
              onClick={() => onSelect(placed.id)}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  onSelect(placed.id);
                }
              }}
              className="cursor-pointer outline-none [&:focus-visible>rect]:stroke-(--ramp-2)"
            >
              <rect
                width={BLOCK_WIDTH}
                height={placed.height}
                rx="8"
                fill="var(--surface)"
                stroke={active ? "var(--ramp-2)" : "var(--border)"}
                strokeWidth={active ? 2 : 1}
                strokeDasharray={block.reachable ? undefined : "4 3"}
              />
              <text x="12" y="18" fontSize="11" fill="var(--muted)">
                <tspan fill="var(--foreground)" fontWeight="600">
                  B{block.id}
                </tspan>
                {`  L${block.start}-${Math.max(block.stop - 1, block.start)}`}
                {block.loop_depth > 0 ? `  loop ${block.loop_depth}` : ""}
                {block.reachable ? "" : "  unreachable"}
              </text>
              {block.instructions.slice(0, SHOWN_LINES).map((line, index) => (
                <text key={line.index} x="12" y={38 + index * 16} fontSize="12" fill="var(--foreground)">
                  {line.text.length > 30 ? `${line.text.slice(0, 29)}...` : line.text}
                </text>
              ))}
              {extra > 0 ? (
                <text x="12" y={38 + SHOWN_LINES * 16} fontSize="11" fill="var(--muted)">
                  +{extra} more
                </text>
              ) : null}
            </g>
          );
        })}
      </svg>
    </div>
  );
}
