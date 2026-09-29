/**
 * What happened to each method's runs, as one stacked bar per method: output
 * matched, output differed, not checked, and runs that did not finish. The
 * segments use the status colours and are named in the legend and on hover.
 */

import type { MethodResult } from "@/lib/suites/results";
import { verdictLabel, type VerificationVerdict } from "@/lib/trace";

const SEGMENTS = [
  { key: "pass", label: "output matched", className: "bg-accent" },
  { key: "fail", label: "output differed", className: "bg-refused" },
  { key: "unchecked", label: "not checked", className: "bg-muted/50" },
  { key: "broken", label: "failed or stopped", className: "bg-flag" },
  { key: "pending", label: "still to run", className: "bg-foreground/10" },
] as const;

type SegmentKey = (typeof SEGMENTS)[number]["key"];

function counts(method: MethodResult): Record<SegmentKey, number> {
  return {
    pass: method.pass,
    fail: method.fail,
    // A run that failed has no output check either; count it once, as broken.
    unchecked: Math.max(method.unchecked - method.failed - method.abandoned, 0),
    broken: method.failed + method.abandoned,
    pending: method.pending,
  };
}

function proofLine(proofs: Record<string, number>): string | null {
  const entries = Object.entries(proofs);
  if (entries.length === 0) return null;
  return entries
    .map(([verdict, n]) => `${n} ${verdictLabel(verdict as VerificationVerdict)}`)
    .join(", ");
}

export function VerificationOutcomes({ methods }: { methods: MethodResult[] }) {
  const rows = [...methods].reverse();
  return (
    <figure className="m-0">
      <ul className="mb-4 flex flex-wrap gap-x-4 gap-y-1 text-xs text-foreground/75">
        {SEGMENTS.map((segment) => (
          <li key={segment.key} className="flex items-center gap-1.5">
            <span aria-hidden className={`size-2.5 rounded-sm ${segment.className}`} />
            {segment.label}
          </li>
        ))}
      </ul>
      <div className="flex flex-col gap-3">
        {rows.map((method) => {
          const c = counts(method);
          const total = Object.values(c).reduce((sum, n) => sum + n, 0);
          const proofs = proofLine(method.proofs);
          return (
            <div key={method.method} className="grid grid-cols-[minmax(0,8.5rem)_minmax(0,1fr)] items-center gap-3 sm:grid-cols-[minmax(0,12rem)_minmax(0,1fr)]">
              <div className="min-w-0">
                <div className="truncate text-sm font-semibold">{method.label}</div>
                <div className="font-terminal text-xs text-muted tabular-nums">
                  {method.pass}/{total} matched
                </div>
              </div>
              <div className="min-w-0">
                <div className="flex h-3 gap-0.5 overflow-hidden rounded-[4px]">
                  {total === 0 ? <span className="h-full flex-1 bg-foreground/10" /> : null}
                  {SEGMENTS.map((segment) =>
                    c[segment.key] === 0 ? null : (
                      <span
                        key={segment.key}
                        title={`${method.label}: ${c[segment.key]} ${segment.label}`}
                        className={`h-full ${segment.className}`}
                        style={{ flexGrow: c[segment.key], flexBasis: 0 }}
                      />
                    ),
                  )}
                </div>
                {proofs ? (
                  <p className="mt-1 font-terminal text-xs text-muted">final proof: {proofs}</p>
                ) : null}
              </div>
            </div>
          );
        })}
      </div>
    </figure>
  );
}
