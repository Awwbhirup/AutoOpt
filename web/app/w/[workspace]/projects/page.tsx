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

import { Empty, Panel, PageHeading } from "@/components/shell/panel";
import { Timestamp } from "@/components/shell/timestamp";
import { authorize } from "@/lib/authorize";
import { categoryLabel } from "@/lib/categories";
import { prisma } from "@/lib/db";
import {
  listProgramsInWorkspace,
  type ProgramListEntry,
} from "@/lib/repositories/programs";
import { listProjects } from "@/lib/repositories/projects";
import { requireWorkspace } from "@/lib/workspace";

import { NewProgramForm } from "./new-program-form";
import { NewProjectForm } from "./new-project-form";

export const metadata: Metadata = {
  title: "Projects",
  description: "The projects in this workspace and the programs inside them.",
};

const TH = "px-3 py-1.5 font-medium";
const TD = "px-3 py-1.5";

function ProgramTable({
  programs,
  slug,
}: {
  programs: ProgramListEntry[];
  slug: string;
}) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left text-sm">
        <thead className="border-b border-zinc-200 text-xs text-zinc-500 dark:border-zinc-800 dark:text-zinc-400">
          <tr>
            <th scope="col" className={TH}>
              Program
            </th>
            <th scope="col" className={TH}>
              Category
            </th>
            <th scope="col" className={`${TH} text-right`}>
              Runs
            </th>
            <th scope="col" className={TH}>
              Author
            </th>
            <th scope="col" className={TH}>
              Updated
            </th>
          </tr>
        </thead>
        <tbody>
          {programs.map((program) => (
            <tr
              key={program.id}
              className="border-b border-zinc-100 last:border-b-0 dark:border-zinc-900"
            >
              <td className={TD}>
                <Link
                  href={`/w/${slug}/programs/${program.id}`}
                  className="text-zinc-900 underline-offset-2 hover:underline dark:text-zinc-100"
                >
                  {program.name}
                </Link>
              </td>
              <td className={`${TD} text-zinc-600 dark:text-zinc-400`}>
                {categoryLabel(program.category)}
              </td>
              <td className={`${TD} text-right tabular-nums text-zinc-600 dark:text-zinc-400`}>
                {program._count.runs}
              </td>
              <td className={`${TD} text-zinc-600 dark:text-zinc-400`}>
                {program.author?.name ?? "unknown"}
              </td>
              <td className={`${TD} text-xs`}>
                <Timestamp at={program.updatedAt} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default async function ProjectsPage({
  params,
}: {
  params: Promise<{ workspace: string }>;
}) {
  const { workspace: slug } = await params;
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
    <main className="mx-auto w-full max-w-6xl px-6 py-8">
      <PageHeading
        title="Projects"
        lead="A project groups programs. A program is the source the engine optimizes."
      />

      {mayCreateProject ? (
        <Panel title="New project">
          <NewProjectForm slug={slug} />
        </Panel>
      ) : (
        <p className="rounded border border-dashed border-zinc-300 px-3 py-2 text-sm text-zinc-500 dark:border-zinc-700 dark:text-zinc-400">
          You are a viewer here, so you can read what is in this workspace but
          not add to it.
        </p>
      )}

      <div className="mt-6 space-y-6">
        {projects.length === 0 ? (
          <p className="rounded border border-dashed border-zinc-300 px-3 py-10 text-center text-sm text-zinc-500 dark:border-zinc-700 dark:text-zinc-400">
            No projects yet.
          </p>
        ) : (
          projects.map((project) => {
            const inside = byProject.get(project.id) ?? [];
            return (
              <Panel
                key={project.id}
                title={project.name}
                aside={
                  <>
                    {project._count.programs}{" "}
                    {project._count.programs === 1 ? "program" : "programs"}
                  </>
                }
              >
                {project.description === null ? null : (
                  <p className="border-b border-zinc-100 px-3 py-2 text-sm text-zinc-600 dark:border-zinc-900 dark:text-zinc-400">
                    {project.description}
                  </p>
                )}

                {inside.length === 0 ? (
                  <Empty>Nothing in this project yet.</Empty>
                ) : (
                  <ProgramTable programs={inside} slug={slug} />
                )}

                {mayAddProgram ? (
                  <details>
                    <summary className="cursor-pointer border-t border-zinc-100 px-3 py-2 text-sm text-zinc-600 hover:text-zinc-900 dark:border-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100">
                      Add a program
                    </summary>
                    <NewProgramForm slug={slug} projectId={project.id} />
                  </details>
                ) : null}
              </Panel>
            );
          })
        )}
      </div>
    </main>
  );
}
