/**
 * Every program against every method: the reduction each method got, tinted by
 * how large it is, with the best method per program marked. The table view of
 * the charts above it, and the way into any single run's trace.
 */

import Link from "next/link";

import { rampAt } from "@/lib/ramp";
import type { MethodResult, ProgramResult } from "@/lib/suites/results";
import { categoryLabel } from "@/lib/categories";

/** A reduction at or above this gets the full tint. */
const FULL_AT = 60;

export function ProgramMatrix({
  programs,
  methods,
  slug,
}: {
  programs: ProgramResult[];
  methods: MethodResult[];
  slug: string;
}) {
  const columns = [...methods].reverse();

  return (
    <div className="relative overflow-x-auto overscroll-x-contain" data-lenis-prevent>
      <table className="w-full border-collapse text-left text-sm">
        <caption className="sr-only">Cost reduction by program and method</caption>
        <thead>
          <tr className="border-b border-line">
            <th scope="col" className="sticky left-0 z-10 h-10 bg-surface px-4 text-[0.78rem] font-medium tracking-wider text-muted uppercase">
              Program
            </th>
            {columns.map((method) => (
              <th
                key={method.method}
                scope="col"
                className="h-12 w-28 px-3 text-right align-bottom text-[0.78rem] leading-tight font-medium tracking-wider text-muted uppercase"
              >
                <span className="block whitespace-nowrap">{method.label}</span>
                {method.baseline ? (
                  <span className="block text-xs tracking-normal normal-case">control</span>
                ) : null}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {programs.map((program) => (
            <tr key={program.programId} className="border-b border-line last:border-b-0">
              <th scope="row" className="sticky left-0 z-10 bg-surface px-4 py-2 text-left font-normal">
                <span className="block max-w-[7.5rem] truncate font-medium sm:max-w-[14rem]">{program.name}</span>
                <span className="block text-xs text-muted">{categoryLabel(program.category)}</span>
              </th>
              {columns.map((method) => {
                const cell = program.cells[method.method];
                if (cell === undefined) {
                  return <td key={method.method} className="px-3 py-2 text-right text-muted">-</td>;
                }
                const best = program.best === method.method;
                const tint =
                  cell.reduction === null || cell.reduction <= 0
                    ? undefined
                    : `color-mix(in srgb, ${rampAt(Math.min(cell.reduction, FULL_AT) / FULL_AT)} 20%, transparent)`;
                return (
                  <td key={method.method} className="p-1 text-right">
                    <Link
                      href={`/w/${slug}/runs/${cell.runId}`}
                      title={`${program.name}, ${method.label}: open the trace`}
                      className="ui-focus ml-auto flex w-24 items-center justify-end gap-1.5 rounded-md px-2 py-1.5 font-terminal text-xs tabular-nums transition-colors hover:ring-1 hover:ring-foreground/20"
                      style={{ background: tint }}
                    >
                      {best ? (
                        <span aria-label="best for this program" className="size-1.5 rounded-full bg-foreground" />
                      ) : null}
                      {cell.outputFailed ? (
                        <span className="text-refused">x FAIL</span>
                      ) : cell.reduction === null ? (
                        <span className="text-muted">{cell.finished < cell.runs ? "..." : "n/a"}</span>
                      ) : (
                        <span>{cell.reduction.toFixed(1)}%</span>
                      )}
                    </Link>
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
