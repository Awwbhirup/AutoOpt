/**
 * One suite: what it runs, the button that runs it, and every run of it so far.
 */

import Link from "next/link";
import { notFound } from "next/navigation";

import { EngineOffline } from "@/components/app/engine-offline";
import { PageMain } from "@/components/app/frame";
import { RunStatusBadge } from "@/components/shell/run-table";
import { Timestamp } from "@/components/shell/timestamp";
import { Badge } from "@/components/ui/badge";
import { DataTable, type Column } from "@/components/ui/data-table";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader, Panel } from "@/components/ui/surface";
import { authorize } from "@/lib/authorize";
import { categoryLabel } from "@/lib/categories";
import { prisma } from "@/lib/db";
import { methodMeta } from "@/lib/methods";
import { findSuite, type SuiteRunSummary } from "@/lib/repositories/suites";
import { engineStatus, runnableMethods } from "@/lib/engine";
import { plannedCount, readGrid } from "@/lib/suites/grid";
import { requireWorkspace } from "@/lib/workspace";

import { StartSuiteRun } from "./start-suite-run";

export default async function SuitePage({
  params,
}: {
  params: Promise<{ workspace: string; id: string }>;
}) {
  const { workspace: slug, id } = await params;
  const { workspace, principal } = await requireWorkspace(slug);

  const [suite, engine] = await Promise.all([findSuite(prisma, id), engineStatus()]);
  if (suite === null || suite.workspaceId !== workspace.id) notFound();

  const grid = readGrid(suite.grid);
  const planned = plannedCount(suite.programs.length, grid);
  const mayRun = authorize(principal, "suite:run");
  const runnable = new Set(
    runnableMethods(engine),
  );
  const missing = engine.online ? grid.methods.filter((method) => !runnable.has(method)) : [];

  const columns: Column<SuiteRunSummary>[] = [
    {
      key: "status",
      header: "Status",
      cell: (run) => (
        <Link href={`/w/${slug}/suites/${suite.id}/runs/${run.id}`} className="ui-focus">
          <RunStatusBadge status={run.status} />
        </Link>
      ),
    },
    {
      key: "progress",
      header: "Runs",
      align: "right",
      mono: true,
      cell: (run) => `${run.completed} / ${run.total}`,
    },
    {
      key: "by",
      header: "Started by",
      wide: true,
      cell: (run) => <span className="text-foreground/75">{run.startedBy?.name ?? run.startedBy?.email ?? "unknown"}</span>,
    },
    { key: "when", header: "Started", className: "text-xs", cell: (run) => <Timestamp at={run.startedAt} /> },
    {
      key: "open",
      header: <span className="sr-only">Results</span>,
      align: "right",
      cell: (run) => (
        <Link
          href={`/w/${slug}/suites/${suite.id}/runs/${run.id}`}
          className="ui-focus font-terminal text-xs text-muted underline-offset-4 hover:text-foreground hover:underline"
        >
          results
        </Link>
      ),
    },
  ];

  return (
    <PageMain>
      <PageHeader
        eyebrow={
          <>
            <Link href={`/w/${slug}/suites`} className="ui-focus underline-offset-4 hover:underline">
              suites
            </Link>{" "}
            / {suite.name}
          </>
        }
        title={suite.name}
        lead={suite.description ?? undefined}
        actions={
          mayRun ? (
            <StartSuiteRun
              slug={slug}
              suiteId={suite.id}
              runs={planned}
              disabled={!engine.online || missing.length > 0 || planned === 0}
            />
          ) : null
        }
      >
        <div className="mt-4 flex flex-wrap items-center gap-2">
          {grid.methods.map((method) => (
            <Badge key={method} tone={methodMeta(method).baseline ? "neutral" : "info"} dashed={methodMeta(method).baseline}>
              {methodMeta(method).label}
              {methodMeta(method).baseline ? " (control)" : ""}
            </Badge>
          ))}
          <span className="font-terminal text-xs text-muted tabular-nums">
            {suite.programs.length} programs x {grid.methods.length} methods x {grid.seeds.length}{" "}
            {grid.seeds.length === 1 ? "seed" : "seeds"} = {planned} runs
            {grid.proveFinal ? ", final proof with Z3" : ""}
          </span>
        </div>
      </PageHeader>

      {!engine.online ? <EngineOffline className="mb-6" /> : null}
      {missing.length > 0 ? (
        <p className="mb-6 text-sm text-refused">
          This engine cannot run {missing.map((method) => methodMeta(method).label).join(", ")} right now.
        </p>
      ) : null}

      <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,22rem)]">
        <Panel title="Runs of this suite" aside={suite.suiteRuns.length === 0 ? undefined : `${suite.suiteRuns.length} shown`}>
          {suite.suiteRuns.length === 0 ? (
            <EmptyState compact title="Not run yet">
              {mayRun ? "Run it to see how the methods compare on these programs." : "Nobody has run it yet."}
            </EmptyState>
          ) : (
            <DataTable columns={columns} rows={suite.suiteRuns} rowKey={(run) => run.id} caption="Suite runs" />
          )}
        </Panel>

        <Panel title="Programs" aside={`${suite.programs.length}`}>
          {suite.programs.length === 0 ? (
            <EmptyState compact title="No programs left">
              The programs this suite held have been deleted.
            </EmptyState>
          ) : (
            <ul className="divide-y divide-line">
              {suite.programs.map(({ program }) => (
                <li key={program.id} className="flex items-baseline justify-between gap-3 px-4 py-2.5">
                  <Link href={`/w/${slug}/programs/${program.id}`} className="ui-focus min-w-0 truncate text-sm font-medium underline-offset-4 hover:underline">
                    {program.name}
                  </Link>
                  <span className="shrink-0 text-xs text-muted">
                    {program.project.name} / {categoryLabel(program.category)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>
    </PageMain>
  );
}
