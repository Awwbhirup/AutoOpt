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
    ? "text-muted opacity-70"
    : delta < 0
      ? "text-accent"
      : delta > 0
        ? "text-refused"
        : "text-muted";

  return (
    <div className="font-terminal tabular-nums text-xs tabular-nums">
      <p className="sr-only">
        Weighted cost {before.weighted_total.toFixed(1)} to{" "}
        {after.weighted_total.toFixed(1)}, {signed(delta)}
        {percent === null ? "" : `, ${signed(-percent)} percent`}. Instructions{" "}
        {before.instruction_count} to {after.instruction_count}. Temporaries {before.temp_vars} to{" "}
        {after.temp_vars}.
      </p>

      <div aria-hidden>
        <div className="flex items-baseline gap-1.5">
          <span className="text-muted">
            {before.weighted_total.toFixed(1)}
          </span>
          <span className="text-muted opacity-70">{"->"}</span>
          <span className="text-foreground">
            {after.weighted_total.toFixed(1)}
          </span>
          <span className={tone}>
            {signed(delta)}
            {percent === null ? "" : ` (${signed(-percent)}%)`}
          </span>
        </div>
        <div className="text-muted">
          {before.instruction_count} {"->"} {after.instruction_count} instructions,{" "}
          {before.temp_vars} {"->"} {after.temp_vars} temporaries
        </div>
      </div>
    </div>
  );
}
