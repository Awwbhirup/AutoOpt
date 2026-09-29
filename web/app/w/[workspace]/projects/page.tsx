/**
 * Everything the workspace keeps, arranged the way it is stored: projects, and
 * the programs inside them.
 *
 * The programs come back in one query and are grouped here, rather than one
 * query per project. Both forms on this page are hidden from a role that may
 * not use them, which is a courtesy and not the check: the actions decide.
 */

import type { Metadata } from "next";
import Link from "next/link";

import { PageMain } from "@/components/app/frame";
import { Timestamp } from "@/components/shell/timestamp";
import { DataTable, type Column } from "@/components/ui/data-table";
import { EmptyState } from "@/components/ui/empty-state";
import { Callout, PageHeader, Panel } from "@/components/ui/surface";
import { authorize } from "@/lib/authorize";
import { categoryLabel } from "@/lib/categories";
import { prisma } from "@/lib/db";
import {
  listProgramsInWorkspace,
  type ProgramListEntry,
} from "@/lib/repositories/programs";
import { listProjects } from "@/lib/repositories/projects";
import { requireWorkspace } from "@/lib/workspace";

import { NewProgramDialog } from "./new-program-form";
import { NewProjectDialog } from "./new-project-form";

export const metadata: Metadata = {
  title: "Projects",
  description: "The projects in this workspace and the programs inside them.",
};

function ProgramTable({
  programs,
  slug,
}: {
  programs: ProgramListEntry[];
  slug: string;
}) {
  const columns: Column<ProgramListEntry>[] = [
    {
      key: "name",
      header: "Program",
      cell: (program) => (
        <Link
          href={`/w/${slug}/programs/${program.id}`}
          className="ui-focus font-medium underline-offset-4 hover:underline"
        >
          {program.name}
        </Link>
      ),
    },
    {
      key: "category",
      header: "Category",
      cell: (program) => (
        <span className="text-foreground/75">{categoryLabel(program.category)}</span>
      ),
    },
    {
      key: "runs",
      header: "Runs",
      align: "right",
      mono: true,
      cell: (program) => program._count.runs,
    },
    {
      key: "author",
      header: "Author",
      wide: true,
      cell: (program) => (
        <span className="text-foreground/75">{program.author?.name ?? "unknown"}</span>
      ),
    },
    {
      key: "updated",
      header: "Updated",
      wide: true,
      className: "text-xs",
      cell: (program) => <Timestamp at={program.updatedAt} />,
    },
  ];

  return (
    <DataTable
      columns={columns}
      rows={programs}
      rowKey={(program) => program.id}
      caption="Programs"
    />
  );
}

export default async function ProjectsPage({
  params,
  searchParams,
}: {
  params: Promise<{ workspace: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { workspace: slug } = await params;
  const openNew = (await searchParams).new === "project";
  const { workspace, principal } = await requireWorkspace(slug);

  const [projects, programs] = await Promise.all([
    listProjects(prisma, workspace.id),
    listProgramsInWorkspace(prisma, workspace.id),
  ]);

  const byProject = new Map<string, ProgramListEntry[]>();
  for (const program of programs) {
    const existing = byProject.get(program.projectId);
    if (existing) existing.push(program);
    else byProject.set(program.projectId, [program]);
  }

  const mayCreateProject = authorize(principal, "project:create");
  const mayAddProgram = authorize(principal, "program:create");

  return (
    <PageMain>
      <PageHeader
        eyebrow={workspace.name}
        title="Projects"
        lead="A project groups programs. A program is the source the engine optimizes."
        actions={mayCreateProject ? <NewProjectDialog slug={slug} defaultOpen={openNew} /> : null}
      />

      {mayCreateProject ? null : (
        <Callout className="mb-6">
          You are a viewer here, so you can read what is in this workspace but not add to it.
        </Callout>
      )}

      {projects.length === 0 ? (
        <Panel>
          <EmptyState
            title="No projects yet"
            action={
              mayCreateProject ? (
                <NewProjectDialog slug={slug} label="Create the first project" />
              ) : null
            }
          >
            Projects hold the programs you want to optimize. Make one, then paste a program into
            it.
          </EmptyState>
        </Panel>
      ) : (
        <div className="space-y-6">
          {projects.map((project) => {
            const inside = byProject.get(project.id) ?? [];
            return (
              <Panel
                key={project.id}
                title={project.name}
                aside={
                  <span className="flex items-center gap-3">
                    <span>
                      {project._count.programs}{" "}
                      {project._count.programs === 1 ? "program" : "programs"}
                    </span>
                    {mayAddProgram ? (
                      <NewProgramDialog
                        slug={slug}
                        projectId={project.id}
                        projectName={project.name}
                      />
                    ) : null}
                  </span>
                }
              >
                {project.description === null ? null : (
                  <p className="border-b border-line px-4 py-3 text-sm leading-relaxed text-foreground/75">
                    {project.description}
                  </p>
                )}

                {inside.length === 0 ? (
                  <EmptyState compact title="Nothing in this project yet">
                    {mayAddProgram ? "Add a program to start running it." : null}
                  </EmptyState>
                ) : (
                  <ProgramTable programs={inside} slug={slug} />
                )}
              </Panel>
            );
          })}
        </div>
      )}
    </PageMain>
  );
}
