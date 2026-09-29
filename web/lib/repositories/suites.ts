/**
 * Benchmark suites and their runs. Reads only; authorization is the caller's,
 * see workspaces.ts.
 *
 * A suite is in a workspace directly. A suite run reaches one through its
 * suite, and its runs through the suite run, which is the path every read
 * here filters on.
 */

import type { Prisma, PrismaClient } from "@prisma/client";

import type { SuiteRunRow } from "../suites/results";

const suiteRunSummarySelect = {
  id: true,
  status: true,
  total: true,
  completed: true,
  startedAt: true,
  finishedAt: true,
  startedBy: { select: { name: true, email: true } },
} satisfies Prisma.SuiteRunSelect;

export type SuiteRunSummary = Prisma.SuiteRunGetPayload<{ select: typeof suiteRunSummarySelect }>;

const suiteListSelect = {
  id: true,
  name: true,
  description: true,
  grid: true,
  createdAt: true,
  createdBy: { select: { name: true } },
  _count: { select: { programs: true, suiteRuns: true } },
  suiteRuns: { select: suiteRunSummarySelect, orderBy: { startedAt: "desc" }, take: 1 },
} satisfies Prisma.BenchmarkSuiteSelect;

export type SuiteListEntry = Prisma.BenchmarkSuiteGetPayload<{ select: typeof suiteListSelect }>;

export function listSuites(db: PrismaClient, workspaceId: string): Promise<SuiteListEntry[]> {
  return db.benchmarkSuite.findMany({
    where: { workspaceId },
    select: suiteListSelect,
    orderBy: { updatedAt: "desc" },
  });
}

const suiteDetailSelect = {
  id: true,
  workspaceId: true,
  name: true,
  description: true,
  grid: true,
  createdAt: true,
  createdBy: { select: { name: true } },
  programs: {
    select: {
      position: true,
      program: {
        select: { id: true, name: true, category: true, project: { select: { name: true } } },
      },
    },
    orderBy: { position: "asc" },
  },
  suiteRuns: { select: suiteRunSummarySelect, orderBy: { startedAt: "desc" }, take: 20 },
} satisfies Prisma.BenchmarkSuiteSelect;

export type SuiteDetail = Prisma.BenchmarkSuiteGetPayload<{ select: typeof suiteDetailSelect }>;

export function findSuite(db: PrismaClient, suiteId: string): Promise<SuiteDetail | null> {
  return db.benchmarkSuite.findUnique({ where: { id: suiteId }, select: suiteDetailSelect });
}

const suiteRunDetailSelect = {
  ...suiteRunSummarySelect,
  grid: true,
  suite: { select: { id: true, name: true, workspaceId: true } },
} satisfies Prisma.SuiteRunSelect;

export type SuiteRunDetail = Prisma.SuiteRunGetPayload<{ select: typeof suiteRunDetailSelect }>;

export function findSuiteRun(db: PrismaClient, suiteRunId: string): Promise<SuiteRunDetail | null> {
  return db.suiteRun.findUnique({ where: { id: suiteRunId }, select: suiteRunDetailSelect });
}

/** The rows the results are computed from, in the order they were planned. */
export async function listSuiteRunRows(
  db: PrismaClient,
  suiteRunId: string,
): Promise<SuiteRunRow[]> {
  const runs = await db.run.findMany({
    where: { suiteRunId },
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
      config: true,
      program: { select: { name: true, category: true } },
    },
  });

  const order = (config: Prisma.JsonValue): number => {
    if (config !== null && typeof config === "object" && !Array.isArray(config)) {
      const value = (config as Record<string, unknown>).order;
      if (typeof value === "number") return value;
    }
    return Number.MAX_SAFE_INTEGER;
  };

  return runs
    .map((run) => ({ run, position: order(run.config) }))
    .sort((a, b) => a.position - b.position)
    .map(({ run }) => ({
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
    }));
}
