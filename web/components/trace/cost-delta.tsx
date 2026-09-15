/**
 * What a rewrite did to the cost model.
 *
 * Shows the weighted total either side of the step and the instruction count
 * under it, because a reader checking a trace wants both the number the engine
 * optimised and the number they can count by hand.
 *
 * A rejected step still gets its numbers, greyed out. The price the engine put
 * on a rewrite it threw away is usually the reason it threw it away.
 *
 * The figures are laid out as columns, which does not survive being read aloud,
 * so the visual side is hidden from assistive technology and a plain sentence
 * carries the same numbers.
 */

import type { Cost } from "@/lib/events";
import { percentReduction } from "@/lib/trace";

function signed(value: number): string {
  return value > 0 ? `+${value.toFixed(1)}` : value.toFixed(1);
}

export function CostDelta({
  before,
  after,
  applied = true,
}: {
  before: Cost;
  after: Cost;
  applied?: boolean;
}) {
  const delta = after.weighted_total - before.weighted_total;
  const percent = percentReduction(before.weighted_total, after.weighted_total);
  const tone = !applied
    ? "text-zinc-400 dark:text-zinc-600"
    : delta < 0
      ? "text-emerald-700 dark:text-emerald-400"
      : delta > 0
        ? "text-rose-700 dark:text-rose-400"
        : "text-zinc-500 dark:text-zinc-400";

  return (
    <div className="font-mono text-xs tabular-nums">
      <p className="sr-only">
        Weighted cost {before.weighted_total.toFixed(1)} to{" "}
        {after.weighted_total.toFixed(1)}, {signed(delta)}
        {percent === null ? "" : `, ${signed(-percent)} percent`}. Instructions{" "}
        {before.instruction_count} to {after.instruction_count}. Temporaries {before.temp_vars} to{" "}
        {after.temp_vars}.
      </p>

      <div aria-hidden>
        <div className="flex items-baseline gap-1.5">
          <span className="text-zinc-500 dark:text-zinc-400">
            {before.weighted_total.toFixed(1)}
          </span>
          <span className="text-zinc-400 dark:text-zinc-600">{"->"}</span>
          <span className="text-zinc-800 dark:text-zinc-200">
            {after.weighted_total.toFixed(1)}
          </span>
          <span className={tone}>
            {signed(delta)}
            {percent === null ? "" : ` (${signed(-percent)}%)`}
          </span>
        </div>
        <div className="text-zinc-500 dark:text-zinc-500">
          {before.instruction_count} {"->"} {after.instruction_count} instructions,{" "}
          {before.temp_vars} {"->"} {after.temp_vars} temporaries
        </div>
      </div>
    </div>
  );
}
