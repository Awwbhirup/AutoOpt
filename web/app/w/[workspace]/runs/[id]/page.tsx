/**
 * One stored run, rendered from its decision log.
 *
 * Nothing here calls the engine. The trace is replayed out of the rows written
 * while the run was going, folded by the same function the live page uses, so
 * the trace a reader sees a week later is the trace that was watched.
 */

import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { PageMain } from "@/components/app/frame";
import { RunStatusBadge } from "@/components/shell/run-table";
import { formatWhen } from "@/components/shell/timestamp";
import { FinalVerdict } from "@/components/trace/final-verdict";
import { TraceStepList } from "@/components/trace/step-list";
import { TacListing } from "@/components/trace/tac-listing";
import { Callout, PageHeader } from "@/components/ui/surface";
import { authorize } from "@/lib/authorize";
import { prisma } from "@/lib/db";
import { streamedEvent, type StreamedEvent } from "@/lib/events";
import { findRunWithEvents } from "@/lib/repositories/runs";
import { foldTrace } from "@/lib/trace";
import { requireWorkspace } from "@/lib/workspace";

export const metadata: Metadata = {
  title: "Run",
  description: "Every decision one optimization run made, as it was recorded.",
};

/**
 * Stored payloads were parsed once on the way in, so one that no longer parses
 * means the engine vocabulary has moved under it. Counted and reported rather
 * than thrown, because a handful of unreadable rows should not take the rest of
 * the trace down with them.
 */
function replay(rows: readonly { payload: unknown }[]): {
  events: StreamedEvent[];
  unreadable: number;
} {
  const events: StreamedEvent[] = [];
  let unreadable = 0;

  for (const row of rows) {
    const parsed = streamedEvent.safeParse(row.payload);
    if (parsed.success) events.push(parsed.data);
    else unreadable += 1;
  }

  return { events, unreadable };
}

function elapsed(startedAt: Date, finishedAt: Date | null): string {
  if (finishedAt === null) return "n/a";
  return `${((finishedAt.getTime() - startedAt.getTime()) / 1000).toFixed(1)} s`;
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <dt className="text-[0.78rem] tracking-wider text-muted uppercase">{label}</dt>
      <dd className="font-terminal tabular-nums mt-0.5 truncate text-sm">{value}</dd>
    </div>
  );
}

export default async function RunDetailPage({
  params,
}: {
  params: Promise<{ workspace: string; id: string }>;
}) {
  const { workspace: slug, id } = await params;
  const { workspace, principal } = await requireWorkspace(slug);
  if (!authorize(principal, "trace:view")) notFound();

  const run = await findRunWithEvents(prisma, id);
  // The run has to be in the workspace the URL named. Without this a member of
  // any workspace could read any run by pointing their own slug at its id.
  if (run === null || run.program.project.workspaceId !== workspace.id) notFound();

  const { events, unreadable } = replay(run.events);
  const trace = foldTrace(events);

  return (
    <PageMain>
      <PageHeader
        eyebrow={
          <>
            <Link href={`/w/${slug}/runs`} className="ui-focus underline-offset-4 hover:underline">
              runs
            </Link>{" "}
            / {run.program.project.name} / {run.id}
          </>
        }
        title={run.program.name}
        actions={<RunStatusBadge status={run.status} />}
      >
        <dl className="mt-5 grid grid-cols-2 gap-x-6 gap-y-3 sm:grid-cols-3 lg:grid-cols-5">
          <Fact label="method" value={run.method} />
          <Fact label="seed" value={String(run.seed)} />
          <Fact label="proof" value={run.finalProof ?? "none"} />
          <Fact label="started" value={formatWhen(run.startedAt)} />
          <Fact label="took" value={elapsed(run.startedAt, run.finishedAt)} />
        </dl>
      </PageHeader>

      <div className="space-y-4">
        {run.status === "ABANDONED" ? (
          <Callout tone="caution" title="This run was abandoned">
            The stream ended before the engine converged, usually because the browser watching it
            went away. The trace below is everything that was written down first, and it still
            reads as running because that is where it stops.
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

        <TraceStepList
          steps={trace.steps}
          status={trace.summary.status}
          initialTac={trace.initialTac}
        />

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
    </PageMain>
  );
}
