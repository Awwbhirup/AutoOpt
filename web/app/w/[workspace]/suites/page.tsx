/**
 * The workspace's benchmark suites: what each one runs, and how its latest run
 * went. Creating one needs programs to exist; running one needs the engine.
 */

import type { Metadata } from "next";
import Link from "next/link";

import { PageMain } from "@/components/app/frame";
import { EngineOffline } from "@/components/app/engine-offline";
import { RunStatusBadge } from "@/components/shell/run-table";
import { Timestamp } from "@/components/shell/timestamp";
import { ButtonLink } from "@/components/ui/button";
import { DataTable, type Column } from "@/components/ui/data-table";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader, Panel } from "@/components/ui/surface";
import { authorize } from "@/lib/authorize";
import { prisma } from "@/lib/db";
import { methodLabel, RULE_METHODS } from "@/lib/methods";
import { listProgramsInWorkspace } from "@/lib/repositories/programs";
import { listProjects } from "@/lib/repositories/projects";
import { listSuites, type SuiteListEntry } from "@/lib/repositories/suites";
import { engineStatus, runnableMethods } from "@/lib/engine";
import { readGrid } from "@/lib/suites/grid";
import { requireWorkspace } from "@/lib/workspace";

import { NewSuiteDialog } from "./new-suite-dialog";

export const metadata: Metadata = {
  title: "Suites",
  description: "Benchmark suites: the same programs through several methods.",
};

export default async function SuitesPage({
  params,
  searchParams,
}: {
  params: Promise<{ workspace: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { workspace: slug } = await params;
  const openNew = (await searchParams).new === "suite";
  const { workspace, principal } = await requireWorkspace(slug);

  const [suites, programs, projects, engine] = await Promise.all([
    listSuites(prisma, workspace.id),
    listProgramsInWorkspace(prisma, workspace.id),
    listProjects(prisma, workspace.id),
    engineStatus(),
  ]);
  const projectName = new Map(projects.map((project) => [project.id, project.name]));
  const mayCreate = authorize(principal, "suite:create");
  const methods = engine.online
    ? runnableMethods(engine)
    : RULE_METHODS;
  const pickable = programs.map((program) => ({
    id: program.id,
    name: program.name,
    project: projectName.get(program.projectId) ?? "",
    category: program.category,
  }));

  const columns: Column<SuiteListEntry>[] = [
    {
      key: "name",
      header: "Suite",
      cell: (suite) => (
        <div className="min-w-0">
          <Link href={`/w/${slug}/suites/${suite.id}`} className="ui-focus font-medium underline-offset-4 hover:underline">
            {suite.name}
          </Link>
          {suite.description ? (
            <span className="block max-w-[22rem] truncate text-xs text-muted">{suite.description}</span>
          ) : null}
        </div>
      ),
    },
    {
      key: "grid",
      header: "Methods",
      wide: true,
      cell: (suite) => (
        <span className="text-xs text-foreground/75">
          {readGrid(suite.grid).methods.map(methodLabel).join(", ")}
        </span>
      ),
    },
    { key: "programs", header: "Programs", align: "right", mono: true, cell: (suite) => suite._count.programs },
    {
      key: "latest",
      header: "Latest run",
      cell: (suite) => {
        const latest = suite.suiteRuns[0];
        if (latest === undefined) return <span className="text-xs text-muted">never run</span>;
        return (
          <Link href={`/w/${slug}/suites/${suite.id}/runs/${latest.id}`} className="ui-focus inline-flex items-center gap-2">
            <RunStatusBadge status={latest.status} />
            <span className="font-terminal text-xs text-muted tabular-nums">
              {latest.completed}/{latest.total}
            </span>
          </Link>
        );
      },
    },
    {
      key: "when",
      header: "Last run",
      wide: true,
      className: "text-xs",
      cell: (suite) =>
        suite.suiteRuns[0] ? <Timestamp at={suite.suiteRuns[0].startedAt} /> : <span className="text-muted">-</span>,
    },
  ];

  const canCreate = mayCreate && programs.length > 0;
  const create = canCreate ? (
    <NewSuiteDialog slug={slug} programs={pickable} methods={methods} defaultOpen={openNew} />
  ) : null;

  return (
    <PageMain>
      <PageHeader
        eyebrow={workspace.name}
        title="Benchmark suites"
        lead="Run a set of programs through several methods and compare what each one takes off, how often it verifies, and where it wins."
        actions={create}
      />

      {engine.online ? null : <EngineOffline className="mb-6" />}

      <Panel title="Suites" aside={suites.length === 0 ? undefined : `${suites.length}`}>
        {suites.length === 0 ? (
          <EmptyState
            title="No suites yet"
            action={
              programs.length === 0 ? (
                <ButtonLink href={`/w/${slug}/projects`} variant="primary" size="sm">
                  Add programs first
                </ButtonLink>
              ) : canCreate ? (
                <NewSuiteDialog slug={slug} programs={pickable} methods={methods} label="Create the first suite" />
              ) : null
            }
          >
            A suite runs every program it holds through every method it names, then shows the
            distribution of cost reduction per method, verification outcomes, and a program by
            method table you can export.
          </EmptyState>
        ) : (
          <DataTable columns={columns} rows={suites} rowKey={(suite) => suite.id} caption="Suites" />
        )}
      </Panel>
    </PageMain>
  );
}
