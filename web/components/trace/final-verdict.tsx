/**
 * The bottom line of a run: what it cost before and after, and whether the
 * optimised program still does what the original did.
 *
 * PASS and FAIL come from the output check alone. A run that is still going,
 * and one that died, have not been checked, and the panel says exactly that
 * rather than showing a verdict nobody has earned yet.
 */

import type { TraceStatus, TraceSummary } from "@/lib/trace";

const STATUS_LABEL: Record<TraceStatus, string> = {
  streaming: "running",
  converged: "converged",
  failed: "failed",
};

function Figure({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs text-zinc-500 dark:text-zinc-400">{label}</dt>
      <dd className="font-mono text-sm text-zinc-900 tabular-nums dark:text-zinc-100">{value}</dd>
    </div>
  );
}

function OutputCheck({ match }: { match: boolean | null }) {
  if (match === null) {
    return (
      <span className="inline-flex items-center gap-1 rounded border border-dashed border-zinc-300 px-2 py-0.5 text-xs font-medium text-zinc-500 dark:border-zinc-700 dark:text-zinc-400">
        <span aria-hidden className="font-mono">
          ?
        </span>
        output not checked
      </span>
    );
  }
  return (
    <span
      className={`inline-flex items-center gap-1 rounded border px-2 py-0.5 text-xs font-semibold ${
        match
          ? "border-emerald-300 bg-emerald-50 text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950 dark:text-emerald-300"
          : "border-rose-300 bg-rose-50 text-rose-800 dark:border-rose-900 dark:bg-rose-950 dark:text-rose-300"
      }`}
    >
      <span aria-hidden className="font-mono">
        {match ? "+" : "x"}
      </span>
      {match ? "PASS" : "FAIL"}
      <span className="font-normal">output match</span>
    </span>
  );
}

export function FinalVerdict({ summary }: { summary: TraceSummary }) {
  const before = summary.costBefore;
  const after = summary.costAfter;
  const reduction =
    summary.reductionPercent === null ? "n/a" : `${summary.reductionPercent.toFixed(1)}%`;

  return (
    <section
      aria-label="Run result"
      className="rounded border border-zinc-200 bg-white p-3 dark:border-zinc-800 dark:bg-zinc-950"
    >
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
          {STATUS_LABEL[summary.status]}
        </h2>
        {summary.method === null ? null : (
          <span className="font-mono text-xs text-zinc-500 dark:text-zinc-400">
            {summary.method}
            {summary.category === null ? "" : ` / ${summary.category}`}
          </span>
        )}
        <span className="ml-auto">
          <OutputCheck match={summary.outputMatch} />
        </span>
      </div>

      {summary.failure === null ? null : (
        <p className="mt-2 rounded border border-rose-300 bg-rose-50 px-2 py-1.5 text-xs text-rose-800 dark:border-rose-900 dark:bg-rose-950 dark:text-rose-300">
          <span className="font-mono font-semibold">{summary.failure.errorType}</span>{" "}
          {summary.failure.message}
        </p>
      )}

      <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-3 lg:grid-cols-6">
        <Figure label="cost before" value={before === null ? "n/a" : before.weighted_total.toFixed(1)} />
        <Figure
          label={summary.status === "converged" ? "cost after" : "cost so far"}
          value={after === null ? "n/a" : after.weighted_total.toFixed(1)}
        />
        <Figure label="reduction" value={reduction} />
        <Figure label="accepted" value={String(summary.accepted)} />
        <Figure label="rejected" value={String(summary.rejected)} />
        <Figure
          label="iterations"
          value={summary.iterations === null ? "n/a" : String(summary.iterations)}
        />
      </dl>

      {before === null || after === null ? null : (
        <p className="mt-3 font-mono text-xs text-zinc-500 tabular-nums dark:text-zinc-400">
          {before.instruction_count} {"->"} {after.instruction_count} instructions,{" "}
          {before.arithmetic_ops} {"->"} {after.arithmetic_ops} arithmetic ops,{" "}
          {before.execution_time_us.toFixed(1)} {"->"} {after.execution_time_us.toFixed(1)} us
        </p>
      )}
    </section>
  );
}
