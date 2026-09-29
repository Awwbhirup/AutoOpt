/**
 * A cost reduction as a number and a short bar. The bar's colour is its rank
 * on the ramp, so a column of them reads worse-to-better at a glance. A run
 * that made things worse has no bar, only the number in the refused colour.
 */

import { rampAt } from "@/lib/ramp";

/** A reduction at or above this fills the bar; few programs get past it. */
const FULL_AT = 60;

export function Reduction({ percent }: { percent: number | null }) {
  if (percent === null) {
    return <span className="font-terminal tabular-nums text-xs text-muted">n/a</span>;
  }

  const share = Math.min(Math.max(percent, 0), FULL_AT) / FULL_AT;

  return (
    <span className="inline-flex items-center justify-end gap-2">
      <span
        aria-hidden
        className="hidden h-1.5 w-14 overflow-hidden rounded-full bg-foreground/5 sm:block"
      >
        <span
          className="block h-full rounded-full"
          style={{ width: `${share * 100}%`, background: rampAt(share) }}
        />
      </span>
      <span
        className={
          percent < 0 ? "font-terminal tabular-nums text-xs text-refused" : "font-terminal tabular-nums text-xs text-foreground"
        }
      >
        {percent.toFixed(1)}%
      </span>
    </span>
  );
}
