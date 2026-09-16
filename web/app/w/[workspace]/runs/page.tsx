/**
 * The most recent runs in a workspace, newest first. Capped by the repository,
 * with no paging behind it yet, so a busy workspace has older runs that only a
 * program's own history reaches.
 *
 * Reads the stored rows and nothing else. A run that finished last week and a
 * run that is going on right now are the same query, because the trace was
 * written down as it happened rather than held by whoever started it.
 */

import type { RunStatus } from "@prisma/client";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { auth } from "@/auth";
import { authorize } from "@/lib/authorize";
import { prisma } from "@/lib/db";
import { listRecentRuns, type RunSummary } from "@/lib/repositories/runs";
import { findWorkspaceBySlug } from "@/lib/repositories/workspaces";
import { percentReduction } from "@/lib/trace";

export const metadata: Metadata = {
  title: "Runs",
  description: "Every optimization run in this workspace, and what it decided.",
};

// Rendered on the server, so a fixed zone rather than the reader's: the server
// does not have theirs, and guessing it would put two different times on the
// same page.
const WHEN = new Intl.DateTimeFormat("en-GB", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "UTC",
});

const STATUS_STYLE: Record<RunStatus, string> = {
  QUEUED:
    "border-zinc-300 bg-zinc-100 text-zinc-700 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-300",
  RUNNING:
    "border-sky-300 bg-sky-50 text-sky-800 dark:border-sky-900 dark:bg-sky-950 dark:text-sky-300",
  SUCCEEDED:
    "border-emerald-300 bg-emerald-50 text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950 dark:text-emerald-300",
  FAILED:
    "border-rose-300 bg-rose-50 text-rose-800 dark:border-rose-900 dark:bg-rose-950 dark:text-rose-300",
  ABANDONED:
    "border-amber-300 bg-amber-50 text-amber-900 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-300",
};

function StatusBadge({ status }: { status: RunStatus }) {
  return (
    <span
      className={`inline-flex items-center rounded border px-1.5 py-0.5 text-xs font-medium ${STATUS_STYLE[status]}`}
    >
      {status.toLowerCase()}
    </span>
  );
}

function reduction(run: RunSummary): string {
  if (run.costBefore === null || run.costAfter === null) return "n/a";
  const percent = percentReduction(run.costBefore, run.costAfter);
  return percent === null ? "n/a" : `${percent.toFixed(1)}%`;
}

function outputCheck(run: RunSummary): string {
  if (run.outputMatch === null) return "not checked";
  return run.outputMatch ? "PASS" : "FAIL";
}

export default async function RunsPage({
  params,
}: {
  params: Promise<{ workspace: string }>;
}) {
  const { workspace: slug } = await params;

  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) redirect("/api/auth/signin");

  const workspace = await findWorkspaceBySlug(prisma, slug, userId);
  if (workspace === null) notFound();

  // The membership came back with the workspace, so the role is already here
  // and asking for it again would be a second query for an answer in hand.
  const principal = { userId, role: workspace.membership?.role ?? null };
  // Not a 403: someone with no standing in this workspace should not learn
  // from the response that it exists.
  if (!authorize(principal, "run:view")) notFound();

  const runs = await listRecentRuns(prisma, workspace.id);

  return (
    <main className="mx-auto w-full max-w-5xl px-6 py-12">
      <header className="mb-8">
        <h1 className="text-2xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
          Runs
        </h1>
        <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
          {workspace.name}. Every run keeps its decision log, so a trace can be
          read long after the page that watched it was closed.
        </p>
      </header>

      {runs.length === 0 ? (
        <p className="rounded border border-dashed border-zinc-300 px-3 py-10 text-center text-sm text-zinc-500 dark:border-zinc-700 dark:text-zinc-400">
          No runs here yet.
        </p>
      ) : (
        <div className="overflow-x-auto rounded border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-950">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-zinc-200 text-xs text-zinc-500 dark:border-zinc-800 dark:text-zinc-400">
              <tr>
                <th scope="col" className="px-3 py-2 font-medium">
                  Program
                </th>
                <th scope="col" className="px-3 py-2 font-medium">
                  Status
                </th>
                <th scope="col" className="px-3 py-2 font-medium">
                  Method
                </th>
                <th scope="col" className="px-3 py-2 text-right font-medium">
                  Cost
                </th>
                <th scope="col" className="px-3 py-2 text-right font-medium">
                  Reduction
                </th>
                <th scope="col" className="px-3 py-2 font-medium">
                  Output
                </th>
                <th scope="col" className="px-3 py-2 font-medium">
                  Started
                </th>
              </tr>
            </thead>
            <tbody>
              {runs.map((run) => (
                <tr
                  key={run.id}
                  className="border-b border-zinc-100 last:border-b-0 dark:border-zinc-900"
                >
                  <td className="px-3 py-2">
                    <Link
                      href={`/w/${slug}/runs/${run.id}`}
                      className="font-medium text-zinc-900 underline-offset-2 hover:underline dark:text-zinc-100"
                    >
                      {run.program.name}
                    </Link>
                    <span className="block text-xs text-zinc-500 dark:text-zinc-400">
                      {run.program.project.name}
                      {run.startedBy?.name ? ` / ${run.startedBy.name}` : ""}
                    </span>
                  </td>
                  <td className="px-3 py-2">
                    <StatusBadge status={run.status} />
                  </td>
                  <td className="px-3 py-2 font-mono text-xs text-zinc-600 dark:text-zinc-400">
                    {run.method}
                  </td>
                  <td className="px-3 py-2 text-right font-mono text-xs text-zinc-600 tabular-nums dark:text-zinc-400">
                    {run.costBefore === null || run.costAfter === null
                      ? "n/a"
                      : `${run.costBefore.toFixed(1)} -> ${run.costAfter.toFixed(1)}`}
                  </td>
                  <td className="px-3 py-2 text-right font-mono text-xs text-zinc-600 tabular-nums dark:text-zinc-400">
                    {reduction(run)}
                  </td>
                  <td className="px-3 py-2 font-mono text-xs text-zinc-600 dark:text-zinc-400">
                    {outputCheck(run)}
                  </td>
                  <td className="px-3 py-2 text-xs whitespace-nowrap text-zinc-500 dark:text-zinc-400">
                    {WHEN.format(run.startedAt)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </main>
  );
}
