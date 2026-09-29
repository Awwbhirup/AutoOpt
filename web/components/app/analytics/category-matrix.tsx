/**
 * Mean cost reduction by program category and method, as a table tinted by
 * size. Categories with the most room for improvement come first.
 */

import type { CategoryRow } from "@/lib/analytics";
import { categoryLabel } from "@/lib/categories";
import { rampAt } from "@/lib/ramp";
import type { MethodResult } from "@/lib/suites/results";

const FULL_AT = 60;

function Cell({ mean, n }: { mean: number | null; n: number }) {
  if (mean === null) return <span className="text-muted">-</span>;
  const tint = mean <= 0 ? undefined : `color-mix(in srgb, ${rampAt(Math.min(mean, FULL_AT) / FULL_AT)} 20%, transparent)`;
  return (
    <span
      title={`${mean.toFixed(1)}% over ${n} runs`}
      className="ml-auto block w-20 rounded-md px-2 py-1.5 font-terminal text-xs tabular-nums"
      style={{ background: tint }}
    >
      {mean.toFixed(1)}%
    </span>
  );
}

export function CategoryMatrix({ rows, methods }: { rows: CategoryRow[]; methods: MethodResult[] }) {
  const columns = [...methods].reverse();
  return (
    <div className="relative overflow-x-auto overscroll-x-contain" data-lenis-prevent>
      <table className="w-full border-collapse text-sm">
        <caption className="sr-only">Mean cost reduction by category and method</caption>
        <thead>
          <tr className="border-b border-line">
            <th scope="col" className="sticky left-0 z-10 h-12 bg-surface px-4 text-left align-bottom text-[0.78rem] font-medium tracking-wider text-muted uppercase">
              Category
            </th>
            <th scope="col" className="h-12 px-3 text-right align-bottom text-[0.78rem] font-medium tracking-wider text-muted uppercase">
              All
            </th>
            {columns.map((method) => (
              <th key={method.method} scope="col" className="h-12 px-3 text-right align-bottom text-[0.78rem] leading-tight font-medium tracking-wider text-muted uppercase">
                <span className="block whitespace-nowrap">{method.label}</span>
                {method.baseline ? <span className="block text-xs tracking-normal normal-case">control</span> : null}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.category} className="border-b border-line last:border-b-0">
              <th scope="row" className="sticky left-0 z-10 bg-surface px-4 py-1.5 text-left font-medium">
                {categoryLabel(row.category)}
                <span className="block font-terminal text-xs font-normal text-muted tabular-nums">n={row.overall.n}</span>
              </th>
              <td className="p-1 text-right">
                <Cell {...row.overall} />
              </td>
              {columns.map((method) => (
                <td key={method.method} className="p-1 text-right">
                  <Cell {...row.byMethod[method.method]} />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
