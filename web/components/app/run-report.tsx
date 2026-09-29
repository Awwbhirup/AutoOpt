/**
 * The body of a stored run: notes on how it ended, the verdict, every step,
 * and the listing before and after. Shared by the workspace run page and the
 * public share page, so a shared link shows exactly what a member sees.
 *
 * Nothing here calls the engine. The trace is replayed out of the rows written
 * while the run was going, folded by the same function the live view uses.
 */

import type { RunStatus } from "@prisma/client";

import { FinalVerdict } from "@/components/trace/final-verdict";
import { TraceStepList } from "@/components/trace/step-list";
import { TacListing } from "@/components/trace/tac-listing";
import { Callout } from "@/components/ui/surface";
import { streamedEvent, type StreamedEvent } from "@/lib/events";
import { foldTrace } from "@/lib/trace";

/**
 * Stored payloads were parsed once on the way in, so one that no longer parses
 * means the engine vocabulary has moved under it. Counted and reported rather
 * than thrown, so a few unreadable rows do not take the trace down with them.
 */
function replay(rows: readonly { payload: unknown }[]): { events: StreamedEvent[]; unreadable: number } {
  const events: StreamedEvent[] = [];
  let unreadable = 0;
  for (const row of rows) {
    const parsed = streamedEvent.safeParse(row.payload);
    if (parsed.success) events.push(parsed.data);
    else unreadable += 1;
  }
  return { events, unreadable };
}

export function RunReport({
  run,
}: {
  run: { status: RunStatus; error: string | null; events: readonly { payload: unknown }[] };
}) {
  const { events, unreadable } = replay(run.events);
  const trace = foldTrace(events);

  return (
    <div className="space-y-4">
      {run.status === "ABANDONED" ? (
        <Callout tone="caution" title="This run was abandoned">
          The stream ended before the engine converged, usually because the browser watching it went
          away. The trace below is everything that was written down first, and it still reads as
          running because that is where it stops.
        </Callout>
      ) : null}

      {run.status === "FAILED" && run.error !== null ? (
        <Callout tone="refused" title="The run failed">
          {run.error}
        </Callout>
      ) : null}

      {unreadable > 0 ? (
        <Callout>
          {unreadable} stored {unreadable === 1 ? "event" : "events"} could not be read back and{" "}
          {unreadable === 1 ? "is" : "are"} left out of the trace.
        </Callout>
      ) : null}

      <FinalVerdict summary={trace.summary} />

      <TraceStepList steps={trace.steps} status={trace.summary.status} initialTac={trace.initialTac} />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div className="min-w-0">
          <TacListing lines={trace.initialTac} label="before" />
        </div>
        {trace.finalTac === null ? null : (
          <div className="min-w-0">
            <TacListing lines={trace.finalTac} previous={trace.initialTac} label="after" />
          </div>
        )}
      </div>
    </div>
  );
}
