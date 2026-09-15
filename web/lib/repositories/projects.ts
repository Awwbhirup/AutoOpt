/**
 * Project reads. Authorization is not done here, see workspaces.ts.
 */

import type { Prisma, PrismaClient } from "@prisma/client";

const projectListSelect = {
  id: true,
  workspaceId: true,
  name: true,
  description: true,
  createdAt: true,
  updatedAt: true,
  // The list shows how full a project is, and counting here beats loading every
  // program to count them in the page.
  _count: { select: { programs: true } },
} satisfies Prisma.ProjectSelect;

export type ProjectListEntry = Prisma.ProjectGetPayload<{
  select: typeof projectListSelect;
}>;

/** By name, since [workspaceId, name] is unique and the name is what is read. */
export function listProjects(
  db: PrismaClient,
  workspaceId: string,
): Promise<ProjectListEntry[]> {
  return db.project.findMany({
    where: { workspaceId },
    select: projectListSelect,
    orderBy: { name: "asc" },
  });
}
