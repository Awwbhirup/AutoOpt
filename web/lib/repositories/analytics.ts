/**
 * The reads behind the analytics page. Every query filters through
 * program -> project -> workspace, the one path a run has to a workspace.
 */

import type { Prisma, PrismaClient } from "@prisma/client";

import type { AnalyticsRun, TransformationGroup } from "../analytics";

/** Enough to draw every chart; a workspace past this sees its most recent runs. */
export const ANALYTICS_RUN_LIMIT = 5000;

function runScope(workspaceId: string, since: Date | null): Prisma.RunWhereInput {
  return {
    program: { project: { workspaceId } },
    ...(since === null ? {} : { startedAt: { gte: since } }),
  };
}

export async function listAnalyticsRuns(
  db: PrismaClient,
  workspaceId: string,
  since: Date | null,
): Promise<AnalyticsRun[]> {
  const runs = await db.run.findMany({
    where: runScope(workspaceId, since),
    select: {
      id: true,
      programId: true,
      method: true,
      seed: true,
      status: true,
      costBefore: true,
      costAfter: true,
      outputMatch: true,
      finalProof: true,
      startedAt: true,
      finishedAt: true,
      program: { select: { name: true, category: true } },
    },
    orderBy: { startedAt: "desc" },
    take: ANALYTICS_RUN_LIMIT,
  });

  return runs.map((run) => ({
    id: run.id,
    programId: run.programId,
    programName: run.program.name,
    category: run.program.category,
    method: run.method,
    seed: run.seed,
    status: run.status,
    costBefore: run.costBefore,
    costAfter: run.costAfter,
    outputMatch: run.outputMatch,
    finalProof: run.finalProof,
    startedAt: run.startedAt,
    finishedAt: run.finishedAt,
  }));
}

export async function transformationGroups(
  db: PrismaClient,
  workspaceId: string,
  since: Date | null,
): Promise<TransformationGroup[]> {
  const groups = await db.transformation.groupBy({
    by: ["kind", "accepted"],
    where: { run: runScope(workspaceId, since) },
    _count: { _all: true },
    _sum: { costBefore: true, costAfter: true },
  });
  return groups.map((group) => ({
    kind: group.kind,
    accepted: group.accepted,
    count: group._count._all,
    sumDelta: (group._sum.costAfter ?? 0) - (group._sum.costBefore ?? 0),
  }));
}

export interface CountedLabel {
  label: string;
  count: number;
}

/** Why rewrites were turned down, most common first. */
export async function rejectReasons(
  db: PrismaClient,
  workspaceId: string,
  since: Date | null,
): Promise<CountedLabel[]> {
  const groups = await db.transformation.groupBy({
    by: ["rejectReason"],
    where: { run: runScope(workspaceId, since), accepted: false },
    _count: { _all: true },
  });
  return groups
    .map((group) => ({ label: group.rejectReason ?? "unstated", count: group._count._all }))
    .sort((a, b) => b.count - a.count);
}

/** What the verifier said about each priced rewrite, most common first. */
export async function verifierVerdicts(
  db: PrismaClient,
  workspaceId: string,
  since: Date | null,
): Promise<CountedLabel[]> {
  const groups = await db.transformation.groupBy({
    by: ["verificationVerdict"],
    where: { run: runScope(workspaceId, since) },
    _count: { _all: true },
  });
  return groups
    .map((group) => ({ label: group.verificationVerdict, count: group._count._all }))
    .sort((a, b) => b.count - a.count);
}
