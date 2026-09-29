/**
 * What the workspace has and what it has spent.
 *
 * Four numbers and the last ten runs. The quota is shown against the row that
 * holds it rather than computed from the runs, because a workspace with no
 * Quota row has no limit, which is not the same as having none left.
 */

import Link from "next/link";

import { PageMain } from "@/components/app/frame";
import { RunTable } from "@/components/shell/run-table";
import { Timestamp } from "@/components/shell/timestamp";
import { ButtonLink } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader, Panel, Stat } from "@/components/ui/surface";
import { prisma } from "@/lib/db";
import { rampAt } from "@/lib/ramp";
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
        <EmptyState compact title="No limit set">
          Runs in this workspace are not counted against a quota.
        </EmptyState>
      </Panel>
    );
  }

  const used = Math.min(quota.usedRuns, quota.monthlyRuns);
  // Guard the division rather than the display: a quota of zero is a workspace
  // that may not run anything, and a bar cannot be drawn against it.
  const share = quota.monthlyRuns === 0 ? 1 : used / quota.monthlyRuns;
  const left = Math.max(quota.monthlyRuns - quota.usedRuns, 0);

  return (
    <Panel
      title="Quota"
      aside={
        <>
          since <Timestamp at={quota.periodStart} />
        </>
      }
    >
      <div className="px-4 py-4">
        <div className="flex items-baseline justify-between gap-3">
          <span className="font-terminal tabular-nums text-2xl font-semibold">
            {quota.usedRuns}
            <span className="text-sm font-normal text-muted"> / {quota.monthlyRuns}</span>
          </span>
          <span className="text-xs text-muted">{left} runs left</span>
        </div>
        <div
          role="meter"
          aria-label="Runs used this period"
          aria-valuemin={0}
          aria-valuemax={quota.monthlyRuns}
          aria-valuenow={used}
          className="mt-3 h-2 w-full overflow-hidden rounded-full bg-foreground/5"
        >
          {/* Reversed ramp: the fuller the bar, the closer to the worse end. */}
          <div
            className="h-full rounded-full transition-[width] duration-500"
            style={{ width: `${share * 100}%`, background: rampAt(1 - share) }}
          />
        </div>
        <p className="mt-3 text-xs leading-relaxed text-muted">
          Every run started from the app or the API counts once, whatever the method.
        </p>
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
    <PageMain>
      <PageHeader
        eyebrow="workspace"
        title={workspace.name}
        lead="Programs kept here, and every run the engine has made of them."
        actions={
          <ButtonLink href={`/w/${slug}/projects`} variant="secondary">
            Projects
          </ButtonLink>
        }
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Projects" value={projects.length} accent="var(--ramp-0)" />
        <Stat label="Programs" value={programs} accent="var(--ramp-1)" />
        <Stat
          label="Runs"
          value={runTotal}
          note="since the workspace was made"
          accent="var(--ramp-2)"
        />
        <Stat
          label="This period"
          value={quota === null ? runTotal : quota.usedRuns}
          note={quota === null ? "no quota set" : `of ${quota.monthlyRuns} allowed`}
          accent="var(--ramp-4)"
        />
      </div>

      <div className="mt-6 grid grid-cols-1 items-start gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,20rem)]">
        <Panel
          title="Recent runs"
          aside={
            <Link href={`/w/${slug}/runs`} className="ui-focus underline-offset-4 hover:underline">
              all runs
            </Link>
          }
        >
          {runs.length === 0 ? (
            <EmptyState
              title="Nothing has been run yet"
              action={
                <ButtonLink href={`/w/${slug}/projects`} variant="primary" size="sm">
                  Add a program
                </ButtonLink>
              }
            >
              Add a program to a project, then pick a search method on its page. Every run keeps
              its full decision trace.
            </EmptyState>
          ) : (
            <RunTable runs={runs} slug={slug} />
          )}
        </Panel>

        <QuotaPanel quota={quota} />
      </div>
    </PageMain>
  );
}
