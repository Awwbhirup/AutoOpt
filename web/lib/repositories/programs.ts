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
