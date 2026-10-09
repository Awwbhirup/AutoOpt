/**
 * One step of a trace: what was spotted, what was proposed for it, what the
 * verifier said, what it cost, and whether it was kept.
 *
 * The summary line holds everything needed to skim the run. The detail behind
 * it is a native `details` element rather than component state, which keeps the
 * whole step list renderable on the server: expanding a step is not a reason to
 * ship a bundle.
 */

import type { TraceStatus, TraceStep } from "@/lib/trace";
import { optimizationLabel, verificationMethodLabel } from "@/lib/trace";

import { CostDelta } from "./cost-delta";
import { TacListing } from "./tac-listing";
import { OutcomeBadge, PendingBadge, VerificationBadge } from "./verdict-badge";

function Counterexample({ values }: { values: Record<string, number> }) {
  const pairs = Object.entries(values);
  if (pairs.length === 0) return null;
  return (
    <p className="font-terminal tabular-nums text-xs text-refused">
      fails on {pairs.map(([name, value]) => `${name} = ${value}`).join(", ")}
    </p>
  );
}

export function TraceStepRow({
  step,
  previousTac = null,
  status = "streaming",
}: {
  step: TraceStep;
  /** The listing this step started from, so the proposal can be marked up. */
  previousTac?: string[] | null;
  status?: TraceStatus;
}) {
  const settled = step.outcome !== null || status !== "streaming";

  return (
    <li
      className={`border-b px-4 py-3 last:border-b-0 ${
        settled
          ? "border-line"
          : "border-dashed border-foreground/15 bg-foreground/5"
      }`}
    >
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <span className="font-terminal tabular-nums text-xs text-muted tabular-nums opacity-70">
          {String(step.index).padStart(2, "0")}
        </span>
        <span className="text-sm font-medium text-foreground">
          {optimizationLabel(step.optimizationType)}
        </span>
        <span className="font-terminal tabular-nums text-xs text-muted">
          {step.site === null ? "no site" : `site ${step.site}`} / iteration {step.iteration}
        </span>
        {step.source === "llm" ? (
          <span className="rounded border border-foreground/15 px-1 text-xs text-muted">
            llm
          </span>
        ) : null}
      </div>

      <div className="mt-1.5 flex flex-wrap items-center gap-2">
        {step.verification === null ? (
          <PendingBadge label="verification not recorded here" />
        ) : (
          <VerificationBadge verdict={step.verification.verdict} />
        )}
        {step.outcome === null ? (
          <PendingBadge label={status === "streaming" ? "in progress" : status === "failed" ? "interrupted" : "evaluated candidate"} />
        ) : (
          <OutcomeBadge
            accepted={step.outcome.accepted}
            rejectReason={step.outcome.rejectReason}
          />
        )}
        {step.cost === null ? null : (
          <span className="ml-auto">
            <CostDelta
              before={step.cost.before}
              after={step.cost.after}
              applied={step.outcome?.accepted ?? false}
            />
          </span>
        )}
      </div>

      {step.verification?.counterexample ? (
        <div className="mt-1.5">
          <Counterexample values={step.verification.counterexample} />
        </div>
      ) : null}

      {step.proposedTac === null && step.rationale === null && step.verification === null ? null : (
        <details className="mt-1.5">
          <summary className="cursor-pointer text-xs text-muted marker:text-muted hover:text-foreground">
            detail
          </summary>
          <div className="mt-2 space-y-2">
            {step.rationale === null ? null : (
              <p className="text-xs text-foreground/75">{step.rationale}</p>
            )}
            {step.derivedFrom.length === 0 ? null : (
              <p className="font-terminal tabular-nums text-xs text-muted">
                derived from {step.derivedFrom.join(", ")}
              </p>
            )}
            {step.verification === null ? null : (
              <p className="font-terminal tabular-nums text-xs text-muted">
                {verificationMethodLabel(step.verification.method)},{" "}
                {step.verification.durationMs.toFixed(1)} ms
                {step.verification.inputsTested === null
                  ? ""
                  : `, ${step.verification.inputsTested} inputs`}
              </p>
            )}
            {step.proposedTac === null ? null : (
              <TacListing
                lines={step.proposedTac}
                previous={previousTac}
                label={step.outcome?.accepted ? "applied" : "proposed"}
              />
            )}
          </div>
        </details>
      )}
    </li>
  );
}
