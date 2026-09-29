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
    "ui-tone-kept",
  tests_passed:
    "ui-tone-kept",
  // Set apart from a proof on purpose: the engine accepts on it, but it is only
  // true up to the unrolling bound.
  unknown_bounded:
    "ui-tone-caution",
  counterexample_found:
    "ui-tone-refused",
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
      <span aria-hidden className="font-terminal tabular-nums">
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
    ? "ui-tone-kept"
    : "ui-tone-neutral";

  return (
    <span className={`${BASE} ${style}`}>
      <span aria-hidden className="font-terminal tabular-nums">
        {accepted ? "+" : "-"}
      </span>
      {accepted ? "accepted" : "rejected"}
      {!accepted && rejectReason !== null ? (
        <span className="font-normal text-muted">
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
      className={`${BASE} border-dashed border-foreground/15 text-muted`}
    >
      <span aria-hidden className="font-terminal tabular-nums">
        .
      </span>
      {label}
    </span>
  );
}
