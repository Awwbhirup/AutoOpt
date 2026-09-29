/**
 * The bottom line of a run: what it cost before and after, and whether the
 * optimised program still does what the original did.
 *
 * PASS and FAIL come from the output check alone. A run that is still going,
 * and one that died, have not been checked, and the panel says exactly that
 * rather than showing a verdict nobody has earned yet.
 */

import { rampAt } from "@/lib/ramp";
import type { TraceStatus, TraceSummary } from "@/lib/trace";

const STATUS_LABEL: Record<TraceStatus, string> = {
  streaming: "running",
  converged: "converged",
  failed: "failed",
};

/** `rank` draws a ramp-coloured rule under the value; text stays ink for contrast. */
function Figure({ label, value, rank }: { label: string; value: string; rank?: string }) {
  return (
    <div className="min-w-0">
      <dt className="text-[0.78rem] tracking-wider text-muted uppercase">{label}</dt>
      <dd className="font-terminal tabular-nums mt-0.5 text-lg font-semibold text-foreground">{value}</dd>
      {rank ? (
        <span aria-hidden className="mt-1 block h-0.5 w-10 rounded-full" style={{ background: rank }} />
      ) : null}
    </div>
  );
}

const DOT: Record<TraceStatus, string> = {
  streaming: "bg-ramp-1 animate-pulse motion-reduce:animate-none",
  converged: "bg-accent",
  failed: "bg-refused",
};

function OutputCheck({ match }: { match: boolean | null }) {
  if (match === null) {
    return (
      <span className="inline-flex items-center gap-1 rounded border border-dashed border-foreground/15 px-2 py-0.5 text-xs font-medium text-muted">
        <span aria-hidden className="font-terminal tabular-nums">
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
          ? "ui-tone-kept"
          : "ui-tone-refused"
      }`}
    >
      <span aria-hidden className="font-terminal tabular-nums">
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
      className="glass glass--card rounded-xl p-4"
    >
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="flex items-center gap-2 text-sm font-semibold text-foreground">
          <span aria-hidden className={`size-2 rounded-full ${DOT[summary.status]}`} />
          {STATUS_LABEL[summary.status]}
        </h2>
        {summary.method === null ? null : (
          <span className="font-terminal tabular-nums text-xs text-muted">
            {summary.method}
            {summary.category === null ? "" : ` / ${summary.category}`}
          </span>
        )}
        <span className="ml-auto">
          <OutputCheck match={summary.outputMatch} />
        </span>
      </div>

      {summary.failure === null ? null : (
        <p className="ui-tone-refused mt-3 rounded-md border px-3 py-2 text-xs">
          <span className="font-terminal tabular-nums font-semibold">{summary.failure.errorType}</span>{" "}
          {summary.failure.message}
        </p>
      )}

      <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-4 sm:grid-cols-3 lg:grid-cols-6">
        <Figure label="cost before" value={before === null ? "n/a" : before.weighted_total.toFixed(1)} />
        <Figure
          label={summary.status === "converged" ? "cost after" : "cost so far"}
          value={after === null ? "n/a" : after.weighted_total.toFixed(1)}
        />
        <Figure
          label="reduction"
          value={reduction}
          rank={
            summary.reductionPercent === null || summary.reductionPercent <= 0
              ? undefined
              : rampAt(Math.min(summary.reductionPercent, 60) / 60)
          }
        />
        <Figure label="accepted" value={String(summary.accepted)} />
        <Figure label="rejected" value={String(summary.rejected)} />
        <Figure
          label="iterations"
          value={summary.iterations === null ? "n/a" : String(summary.iterations)}
        />
      </dl>

      {before === null || after === null ? null : (
        <p className="font-terminal tabular-nums mt-4 border-t border-line pt-3 text-xs text-muted tabular-nums">
          {before.instruction_count} {"->"} {after.instruction_count} instructions,{" "}
          {before.arithmetic_ops} {"->"} {after.arithmetic_ops} arithmetic ops,{" "}
          {before.execution_time_us.toFixed(1)} {"->"} {after.execution_time_us.toFixed(1)} us
        </p>
      )}
    </section>
  );
}
