/**
 * The two badges a step carries: what the verifier said, and what the engine
 * did about it.
 *
 * Every badge prints its verdict in words and carries a marker glyph as well,
 * because a reader who cannot tell the green one from the red one still has to
 * be able to read the trace. Colour is the third cue here, not the only one.
 */

import type { RejectReason, VerificationVerdict } from "@/lib/trace";
import { rejectLabel, verdictLabel } from "@/lib/trace";

const BASE =
  "inline-flex items-center gap-1 rounded border px-1.5 py-0.5 text-xs font-medium whitespace-nowrap";

const VERDICT_STYLE: Record<VerificationVerdict, string> = {
  proven_equivalent:
    "border-emerald-300 bg-emerald-50 text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950 dark:text-emerald-300",
  tests_passed:
    "border-emerald-300 bg-emerald-50 text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950 dark:text-emerald-300",
  // Set apart from a proof on purpose: the engine accepts on it, but it is only
  // true up to the unrolling bound.
  unknown_bounded:
    "border-amber-300 bg-amber-50 text-amber-900 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-300",
  counterexample_found:
    "border-rose-300 bg-rose-50 text-rose-800 dark:border-rose-900 dark:bg-rose-950 dark:text-rose-300",
};

const VERDICT_MARKER: Record<VerificationVerdict, string> = {
  proven_equivalent: "=",
  tests_passed: "+",
  unknown_bounded: "?",
  counterexample_found: "x",
};

export function VerificationBadge({ verdict }: { verdict: VerificationVerdict }) {
  return (
    <span className={`${BASE} ${VERDICT_STYLE[verdict]}`}>
      <span aria-hidden className="font-mono">
        {VERDICT_MARKER[verdict]}
      </span>
      {verdictLabel(verdict)}
    </span>
  );
}

export function OutcomeBadge({
  accepted,
  rejectReason,
}: {
  accepted: boolean;
  rejectReason: RejectReason | null;
}) {
  const style = accepted
    ? "border-emerald-300 bg-emerald-50 text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950 dark:text-emerald-300"
    : "border-zinc-300 bg-zinc-100 text-zinc-700 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-300";

  return (
    <span className={`${BASE} ${style}`}>
      <span aria-hidden className="font-mono">
        {accepted ? "+" : "-"}
      </span>
      {accepted ? "accepted" : "rejected"}
      {!accepted && rejectReason !== null ? (
        <span className="font-normal text-zinc-500 dark:text-zinc-400">
          : {rejectLabel(rejectReason)}
        </span>
      ) : null}
    </span>
  );
}

/** Shown where a step has not reached that point yet. */
export function PendingBadge({ label }: { label: string }) {
  return (
    <span
      className={`${BASE} border-dashed border-zinc-300 text-zinc-500 dark:border-zinc-700 dark:text-zinc-400`}
    >
      <span aria-hidden className="font-mono">
        .
      </span>
      {label}
    </span>
  );
}
