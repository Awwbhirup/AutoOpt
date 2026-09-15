/**
 * The steps of a run, in the order the engine took them.
 *
 * The live region is rendered whatever the status, not only while streaming: a
 * region that appears at the same moment its text does is usually not announced
 * at all, so it has to be sitting in the document before the first update.
 *
 * Each step is told the listing it started from so the proposal can be marked
 * up against it. That is tracked here rather than on the step itself because
 * only the accepted rewrites move the program on, and a step has no way of
 * knowing what came before it.
 */

import type { TraceStatus, TraceStep } from "@/lib/trace";

import { TraceStepRow } from "./step-row";

/**
 * The listing each step started from. Null where there is no baseline yet,
 * which is not the same as a program that started out empty: an empty baseline
 * marks every line of the first proposal as new.
 */
function listingsBefore(
  steps: TraceStep[],
  initialTac: string[] | null,
): (string[] | null)[] {
  const before: (string[] | null)[] = [];
  let listing = initialTac;
  for (const step of steps) {
    before.push(listing);
    if (step.outcome?.accepted && step.proposedTac !== null) listing = step.proposedTac;
  }
  return before;
}

function progress(status: TraceStatus, steps: TraceStep[]): string {
  const count = `${steps.length} ${steps.length === 1 ? "step" : "steps"}`;
  if (status === "failed") return `Run failed after ${count}.`;
  if (status === "converged") return `Run finished, ${count}.`;
  return steps.length === 0 ? "Waiting for the first step." : `Running, ${count} so far.`;
}

export function TraceStepList({
  steps,
  status,
  initialTac = null,
}: {
  steps: TraceStep[];
  status: TraceStatus;
  initialTac?: string[] | null;
}) {
  const before = listingsBefore(steps, initialTac);

  return (
    <section aria-label="Decision trace">
      <p
        role="status"
        aria-live="polite"
        className="mb-2 text-xs text-zinc-500 dark:text-zinc-400"
      >
        {progress(status, steps)}
      </p>

      {steps.length === 0 ? (
        <p className="rounded border border-dashed border-zinc-300 px-3 py-6 text-center text-sm text-zinc-500 dark:border-zinc-700 dark:text-zinc-400">
          No steps yet.
        </p>
      ) : (
        <ol className="overflow-hidden rounded border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-950">
          {steps.map((step, index) => (
            <TraceStepRow key={step.index} step={step} previousTac={before[index]} />
          ))}
        </ol>
      )}
    </section>
  );
}
