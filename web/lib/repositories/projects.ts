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

const projectRefSelect = {
  id: true,
  workspaceId: true,
  name: true,
} satisfies Prisma.ProjectSelect;

export type ProjectRef = Prisma.ProjectGetPayload<{
  select: typeof projectRefSelect;
}>;

/**
 * One project by id, carrying the workspace it belongs to.
 *
 * A project id arrives from a form, so whoever is about to write into it has to
 * be able to compare that workspace against the one the request was authorized
 * for. Looking the project up by id alone is the only way to make that
 * comparison possible.
 */
export function findProject(
  db: PrismaClient,
  projectId: string,
): Promise<ProjectRef | null> {
  return db.project.findUnique({
    where: { id: projectId },
    select: projectRefSelect,
  });
}

export interface NewProject {
  workspaceId: string;
  name: string;
  description: string | null;
}

/**
 * Insert a project.
 *
 * A duplicate name is left to the [workspaceId, name] unique rather than
 * checked first: a read followed by a write is two statements, and a second
 * request fits between them.
 */
export function createProject(
  db: PrismaClient,
  input: NewProject,
): Promise<ProjectRef> {
  return db.project.create({ data: input, select: projectRefSelect });
}
