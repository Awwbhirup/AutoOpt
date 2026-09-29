"use client";

/**
 * The three-address listing, grouped by basic block: a numbered line each,
 * a rule and a label where a block starts, the selected block banded.
 */

import { cx } from "@/lib/cx";

import type { Analysis } from "./types";

export function TacView({
  analysis,
  selected,
  onSelect,
}: {
  analysis: Analysis;
  selected: number | null;
  onSelect: (id: number) => void;
}) {
  return (
    <ol className="font-terminal text-xs leading-6" aria-label="Three-address code">
      {analysis.blocks.map((block) => (
        <li key={block.id} className="border-t border-line first:border-t-0">
          <button
            type="button"
            onClick={() => onSelect(block.id)}
            className={cx(
              "ui-focus block w-full text-left transition-colors",
              selected === block.id ? "bg-ramp-2/10" : "hover:bg-foreground/5",
            )}
          >
            <span className="flex items-center justify-between px-3 pt-1.5 text-[0.72rem] text-muted">
              <span>
                B{block.id}
                {block.loop_depth > 0 ? `, loop depth ${block.loop_depth}` : ""}
                {block.reachable ? "" : ", unreachable"}
              </span>
              <span>{block.instructions.length} instr</span>
            </span>
            {block.instructions.map((line) => (
              <span key={line.index} className="grid grid-cols-[2.5rem_1fr] px-3">
                <span className="pr-3 text-right text-muted select-none">{line.index}</span>
                <span className="whitespace-pre">{line.text}</span>
              </span>
            ))}
          </button>
        </li>
      ))}
    </ol>
  );
}
