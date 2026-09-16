/**
 * One stored run, rendered from its decision log.
 *
 * Nothing here calls the engine. The trace is replayed out of the rows written
 * while the run was going, folded by the same function the live page uses, so
 * the trace a reader sees a week later is the trace that was watched.
 */

import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { FinalVerdict } from "@/components/trace/final-verdict";
import { TraceStepList } from "@/components/trace/step-list";
import { TacListing } from "@/components/trace/tac-listing";
import { auth } from "@/auth";
import { authorize } from "@/lib/authorize";
import { prisma } from "@/lib/db";
import { streamedEvent, type StreamedEvent } from "@/lib/events";
import { findRunWithEvents } from "@/lib/repositories/runs";
import { findWorkspaceBySlug } from "@/lib/repositories/workspaces";
import { foldTrace } from "@/lib/trace";

export const metadata: Metadata = {
  title: "Run",
  description: "Every decision one optimization run made, as it was recorded.",
};

const WHEN = new Intl.DateTimeFormat("en-GB", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "UTC",
});

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
    <div>
      <dt className="text-xs text-zinc-500 dark:text-zinc-400">{label}</dt>
      <dd className="font-mono text-sm text-zinc-900 dark:text-zinc-100">{value}</dd>
    </div>
  );
}

export default async function RunDetailPage({
  params,
}: {
  params: Promise<{ workspace: string; id: string }>;
}) {
  const { workspace: slug, id } = await params;

  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) redirect("/api/auth/signin");

  const workspace = await findWorkspaceBySlug(prisma, slug, userId);
  if (workspace === null) notFound();

  const principal = { userId, role: workspace.membership?.role ?? null };
  if (!authorize(principal, "trace:view")) notFound();

  const run = await findRunWithEvents(prisma, id);
  // The run has to be in the workspace the URL named. Without this a member of
  // any workspace could read any run by pointing their own slug at its id.
  if (run === null || run.program.project.workspaceId !== workspace.id) notFound();

  const { events, unreadable } = replay(run.events);
  const trace = foldTrace(events);

  return (
    <main className="mx-auto w-full max-w-5xl px-6 py-12">
      <header className="mb-6">
        <Link
          href={`/w/${slug}/runs`}
          className="text-xs text-zinc-500 underline-offset-2 hover:underline dark:text-zinc-400"
        >
          back to runs
        </Link>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
          {run.program.name}
        </h1>
        <p className="mt-1 font-mono text-xs text-zinc-500 dark:text-zinc-400">
          {run.program.project.name} / {run.id}
        </p>

        <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-3 lg:grid-cols-6">
          <Fact label="status" value={run.status.toLowerCase()} />
          <Fact label="method" value={run.method} />
          <Fact label="seed" value={String(run.seed)} />
          <Fact label="proof" value={run.finalProof ?? "none"} />
          <Fact label="started" value={WHEN.format(run.startedAt)} />
          <Fact label="took" value={elapsed(run.startedAt, run.finishedAt)} />
        </dl>
      </header>

      {run.status === "ABANDONED" ? (
        <p className="mb-4 rounded border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-300">
          This run was abandoned: the stream ended before the engine converged,
          usually because the browser watching it went away. The trace below is
          everything that was written down first, and it still reads as running
          because that is where it stops.
        </p>
      ) : null}

      {run.status === "FAILED" && run.error !== null ? (
        <p className="mb-4 rounded border border-rose-300 bg-rose-50 px-3 py-2 text-sm text-rose-800 dark:border-rose-900 dark:bg-rose-950 dark:text-rose-300">
          {run.error}
        </p>
      ) : null}

      {unreadable > 0 ? (
        <p className="mb-4 rounded border border-dashed border-zinc-300 px-3 py-2 text-xs text-zinc-500 dark:border-zinc-700 dark:text-zinc-400">
          {unreadable} stored {unreadable === 1 ? "event" : "events"} could not be
          read back and {unreadable === 1 ? "is" : "are"} left out of the trace.
        </p>
      ) : null}

      <div className="space-y-6">
        <FinalVerdict summary={trace.summary} />

        <TraceStepList
          steps={trace.steps}
          status={trace.summary.status}
          initialTac={trace.initialTac}
        />

        <div className="grid gap-4 lg:grid-cols-2">
          <TacListing lines={trace.initialTac} label="before" />
          {trace.finalTac === null ? null : (
            <TacListing lines={trace.finalTac} previous={trace.initialTac} label="after" />
          )}
        </div>
      </div>
    </main>
  );
}
