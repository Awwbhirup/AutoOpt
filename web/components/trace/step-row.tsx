/**
 * One step of a trace: what was spotted, what was proposed for it, what the
 * verifier said, what it cost, and whether it was kept.
 *
 * The summary line holds everything needed to skim the run. The detail behind
 * it is a native `details` element rather than component state, which keeps the
 * whole step list renderable on the server: expanding a step is not a reason to
 * ship a bundle.
 */

import type { TraceStep } from "@/lib/trace";
import { optimizationLabel, verificationMethodLabel } from "@/lib/trace";

import { CostDelta } from "./cost-delta";
import { TacListing } from "./tac-listing";
import { OutcomeBadge, PendingBadge, VerificationBadge } from "./verdict-badge";

function Counterexample({ values }: { values: Record<string, number> }) {
  const pairs = Object.entries(values);
  if (pairs.length === 0) return null;
  return (
    <p className="font-mono text-xs text-rose-700 dark:text-rose-400">
      fails on {pairs.map(([name, value]) => `${name} = ${value}`).join(", ")}
    </p>
  );
}

export function TraceStepRow({
  step,
  previousTac = null,
}: {
  step: TraceStep;
  /** The listing this step started from, so the proposal can be marked up. */
  previousTac?: string[] | null;
}) {
  const settled = step.outcome !== null;

  return (
    <li
      className={`border-b px-3 py-2 last:border-b-0 ${
        settled
          ? "border-zinc-200 dark:border-zinc-800"
          : "border-dashed border-zinc-300 bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900"
      }`}
    >
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <span className="font-mono text-xs text-zinc-400 tabular-nums dark:text-zinc-600">
          {String(step.index).padStart(2, "0")}
        </span>
        <span className="text-sm font-medium text-zinc-900 dark:text-zinc-100">
          {optimizationLabel(step.optimizationType)}
        </span>
        <span className="font-mono text-xs text-zinc-500 dark:text-zinc-400">
          {step.site === null ? "no site" : `site ${step.site}`} / iteration {step.iteration}
        </span>
        {step.source === "llm" ? (
          <span className="rounded border border-zinc-300 px-1 text-xs text-zinc-500 dark:border-zinc-700 dark:text-zinc-400">
            llm
          </span>
        ) : null}
      </div>

      <div className="mt-1.5 flex flex-wrap items-center gap-2">
        {step.verification === null ? (
          <PendingBadge label="not verified" />
        ) : (
          <VerificationBadge verdict={step.verification.verdict} />
        )}
        {step.outcome === null ? (
          <PendingBadge label="in progress" />
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
          <summary className="cursor-pointer text-xs text-zinc-500 marker:text-zinc-400 hover:text-zinc-800 dark:text-zinc-400 dark:hover:text-zinc-100">
            detail
          </summary>
          <div className="mt-2 space-y-2">
            {step.rationale === null ? null : (
              <p className="text-xs text-zinc-600 dark:text-zinc-400">{step.rationale}</p>
            )}
            {step.derivedFrom.length === 0 ? null : (
              <p className="font-mono text-xs text-zinc-500 dark:text-zinc-400">
                derived from {step.derivedFrom.join(", ")}
              </p>
            )}
            {step.verification === null ? null : (
              <p className="font-mono text-xs text-zinc-500 dark:text-zinc-400">
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
