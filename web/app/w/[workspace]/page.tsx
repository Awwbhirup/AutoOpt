/**
 * What the workspace has and what it has spent.
 *
 * Four numbers and the last ten runs. The quota is shown against the row that
 * holds it rather than computed from the runs, because a workspace with no
 * Quota row has no limit, which is not the same as having none left.
 */

import Link from "next/link";

import { Empty, Panel, PageHeading, Stat } from "@/components/shell/panel";
import { RunTable } from "@/components/shell/run-table";
import { Timestamp } from "@/components/shell/timestamp";
import { prisma } from "@/lib/db";
import { listProjects } from "@/lib/repositories/projects";
import { countRuns, listRecentRuns } from "@/lib/repositories/runs";
import { findQuota, type WorkspaceQuota } from "@/lib/repositories/workspaces";
import { requireWorkspace } from "@/lib/workspace";

/** Enough to see what is going on without becoming the runs page. */
const RECENT = 10;

function QuotaPanel({ quota }: { quota: WorkspaceQuota | null }) {
  if (quota === null) {
    return (
      <Panel title="Quota">
        <Empty>No limit is set on this workspace.</Empty>
      </Panel>
    );
  }

  const used = Math.min(quota.usedRuns, quota.monthlyRuns);
  // Guard the division rather than the display: a quota of zero is a workspace
  // that may not run anything, and a bar cannot be drawn against it.
  const share = quota.monthlyRuns === 0 ? 100 : (used / quota.monthlyRuns) * 100;
  const left = Math.max(quota.monthlyRuns - quota.usedRuns, 0);

  return (
    <Panel
      title="Quota"
      aside={
        <>
          period from <Timestamp at={quota.periodStart} />
        </>
      }
    >
      <div className="px-3 py-3">
        <div className="flex items-baseline justify-between text-sm">
          <span className="tabular-nums text-zinc-900 dark:text-zinc-100">
            {quota.usedRuns} of {quota.monthlyRuns} runs this period
          </span>
          <span className="text-xs tabular-nums text-zinc-500 dark:text-zinc-400">
            {left} left
          </span>
        </div>
        <div className="mt-2 h-1.5 w-full rounded bg-zinc-200 dark:bg-zinc-800">
          <div
            className="h-1.5 rounded bg-zinc-900 dark:bg-zinc-100"
            style={{ width: `${share}%` }}
          />
        </div>
      </div>
    </Panel>
  );
}

export default async function WorkspaceDashboard({
  params,
}: {
  params: Promise<{ workspace: string }>;
}) {
  const { workspace: slug } = await params;
  const { workspace } = await requireWorkspace(slug);

  const [projects, runs, runTotal, quota] = await Promise.all([
    listProjects(prisma, workspace.id),
    listRecentRuns(prisma, workspace.id, RECENT),
    countRuns(prisma, workspace.id),
    findQuota(prisma, workspace.id),
  ]);

  // Counted from the list rather than asked for again: the projects query
  // already carries the per-project totals the page below prints.
  const programs = projects.reduce((total, project) => total + project._count.programs, 0);

  return (
    <main className="mx-auto w-full max-w-6xl px-6 py-8">
      <PageHeading
        title={workspace.name}
        lead="Programs kept here, and every run the engine has made of them."
      />

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Projects" value={projects.length} />
        <Stat label="Programs" value={programs} />
        <Stat label="Runs" value={runTotal} note="since the workspace was made" />
        <Stat
          label="Runs this period"
          value={quota === null ? runTotal : quota.usedRuns}
          note={quota === null ? "no quota set" : `of ${quota.monthlyRuns}`}
        />
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,20rem)]">
        <Panel
          title="Recent runs"
          aside={<Link href={`/w/${slug}/runs`}>all runs</Link>}
        >
          {runs.length === 0 ? (
            <Empty>
              Nothing has been run yet. Add a program under{" "}
              <Link
                href={`/w/${slug}/projects`}
                className="underline underline-offset-2"
              >
                projects
              </Link>
              .
            </Empty>
          ) : (
            <RunTable runs={runs} slug={slug} />
          )}
        </Panel>

        <QuotaPanel quota={quota} />
      </div>
    </main>
  );
}
