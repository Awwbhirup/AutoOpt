"use client";

/**
 * The dataflow facts the engine computed, one row per block: which variables
 * are live on the way in and out, which definitions reach it (by TAC line),
 * and which expressions are already available.
 */

import { cx } from "@/lib/cx";
import { expressionText } from "@/lib/playground/facts";

import type { Analysis } from "./types";

function List({ items, empty = "none" }: { items: string[]; empty?: string }) {
  if (items.length === 0) return <span className="text-muted">{empty}</span>;
  return (
    <span className="flex flex-wrap gap-1">
      {items.map((item) => (
        <span key={item} className="rounded bg-foreground/5 px-1.5 py-0.5">
          {item}
        </span>
      ))}
    </span>
  );
}

export function DataflowTable({
  analysis,
  selected,
  onSelect,
}: {
  analysis: Analysis;
  selected: number | null;
  onSelect: (id: number) => void;
}) {
  return (
    <div className="relative overflow-x-auto overscroll-x-contain" data-lenis-prevent>
      <table className="w-full min-w-[46rem] border-collapse text-left font-terminal text-xs">
        <caption className="sr-only">Dataflow facts per basic block</caption>
        <thead>
          <tr className="border-b border-line font-display text-[0.78rem] tracking-wider text-muted uppercase">
            <th scope="col" className="px-3 py-2 font-medium">Block</th>
            <th scope="col" className="px-3 py-2 font-medium">Live in</th>
            <th scope="col" className="px-3 py-2 font-medium">Live out</th>
            <th scope="col" className="px-3 py-2 font-medium">Reaching defs in</th>
            <th scope="col" className="min-w-40 px-3 py-2 font-medium">Available in</th>
          </tr>
        </thead>
        <tbody>
          {analysis.blocks.map((block) => (
            <tr
              key={block.id}
              onClick={() => onSelect(block.id)}
              className={cx(
                "cursor-pointer border-b border-line align-top last:border-b-0",
                selected === block.id ? "bg-ramp-2/10" : "hover:bg-foreground/5",
              )}
            >
              <th scope="row" className="px-3 py-2 font-semibold">
                B{block.id}
              </th>
              <td className="px-3 py-2">
                <List items={block.facts.live_in} />
              </td>
              <td className="px-3 py-2">
                <List items={block.facts.live_out} />
              </td>
              <td className="px-3 py-2">
                <List items={block.facts.reaching_in.map((line) => `L${line}`)} />
              </td>
              <td className="px-3 py-2">
                <List items={block.facts.available_in.map((fact) => `${expressionText(fact.expression)} in ${fact.holder}`)} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
