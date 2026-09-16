/**
 * Program reads. Authorization is not done here, see workspaces.ts.
 */

import type { Prisma, PrismaClient } from "@prisma/client";

const programListSelect = {
  id: true,
  projectId: true,
  name: true,
  category: true,
  // Denormalized instruction counts, enough to render a row.
  features: true,
  uploadName: true,
  createdAt: true,
  updatedAt: true,
  author: { select: { id: true, name: true, image: true } },
  _count: { select: { runs: true } },
} satisfies Prisma.ProgramSelect;

export type ProgramListEntry = Prisma.ProgramGetPayload<{
  select: typeof programListSelect;
}>;

/**
 * The programs in a project, most recently touched first.
 *
 * `source` is deliberately absent: it is a whole program body per row, and a
 * list of them is a page that gets slower the more use a project sees.
 */
export function listPrograms(
  db: PrismaClient,
  projectId: string,
): Promise<ProgramListEntry[]> {
  return db.program.findMany({
    where: { projectId },
    select: programListSelect,
    orderBy: { updatedAt: "desc" },
  });
}

/**
 * Every program in a workspace, grouped by project on the way out.
 *
 * One query rather than listPrograms per project: the projects page shows all
 * of them, and the number of projects is whatever the workspace has made.
 */
export function listProgramsInWorkspace(
  db: PrismaClient,
  workspaceId: string,
): Promise<ProgramListEntry[]> {
  return db.program.findMany({
    where: { project: { workspaceId } },
    select: programListSelect,
    orderBy: [{ project: { name: "asc" } }, { updatedAt: "desc" }],
  });
}

const programDetailSelect = {
  ...programListSelect,
  source: true,
  // The workspace, so the caller can refuse a program id that belongs to
  // someone else's workspace before rendering a line of it.
  project: { select: { id: true, name: true, workspaceId: true } },
} satisfies Prisma.ProgramSelect;

export type ProgramDetail = Prisma.ProgramGetPayload<{
  select: typeof programDetailSelect;
}>;

export function findProgram(
  db: PrismaClient,
  programId: string,
): Promise<ProgramDetail | null> {
  return db.program.findUnique({
    where: { id: programId },
    select: programDetailSelect,
  });
}

const programRefSelect = {
  id: true,
  projectId: true,
  name: true,
} satisfies Prisma.ProgramSelect;

export type ProgramRef = Prisma.ProgramGetPayload<{
  select: typeof programRefSelect;
}>;

export interface NewProgram {
  projectId: string;
  authorId: string;
  name: string;
  source: string;
  category: string;
}

/**
 * Insert a program.
 *
 * `features` is left unset. The instruction counts are the engine's to report,
 * and guessing them here would put a number on the page that no run produced.
 */
export function createProgram(
  db: PrismaClient,
  input: NewProgram,
): Promise<ProgramRef> {
  return db.program.create({ data: input, select: programRefSelect });
}
