/**
 * Runs and their decision log. Authorization is not done here, see
 * workspaces.ts.
 *
 * A run has no workspace column. The path to one is run -> program -> project
 * -> workspace and it is the only path, which is what lets a single where
 * clause stand for the whole tenancy boundary.
 */

import type { Prisma, PrismaClient, Run, RunStatus } from "@prisma/client";

const runEventSelect = {
  id: true,
  seq: true,
  kind: true,
  payload: true,
  createdAt: true,
} satisfies Prisma.RunEventSelect;

const runDetailSelect = {
  id: true,
  programId: true,
  startedById: true,
  suiteRunId: true,
  method: true,
  seed: true,
  config: true,
  status: true,
  costBefore: true,
  costAfter: true,
  outputMatch: true,
  finalProof: true,
  error: true,
  startedAt: true,
  finishedAt: true,
  program: {
    select: {
      id: true,
      name: true,
      category: true,
      source: true,
      project: { select: { id: true, name: true, workspaceId: true } },
    },
  },
  // seq, not createdAt: two events written in the same batch share a timestamp
  // to the millisecond, and a trace out of order is a trace that lies about
  // what the engine decided when.
  events: { select: runEventSelect, orderBy: { seq: "asc" } },
} satisfies Prisma.RunSelect;

export type RunWithEvents = Prisma.RunGetPayload<{
  select: typeof runDetailSelect;
}>;

/** One run and its whole decision log, in the order the engine produced it. */
export function findRunWithEvents(
  db: PrismaClient,
  runId: string,
): Promise<RunWithEvents | null> {
  return db.run.findUnique({ where: { id: runId }, select: runDetailSelect });
}

const runSummarySelect = {
  id: true,
  status: true,
  method: true,
  seed: true,
  costBefore: true,
  costAfter: true,
  outputMatch: true,
  startedAt: true,
  finishedAt: true,
  program: {
    select: {
      id: true,
      name: true,
      project: { select: { id: true, name: true } },
    },
  },
  startedBy: { select: { id: true, name: true, image: true } },
} satisfies Prisma.RunSelect;

export type RunSummary = Prisma.RunGetPayload<{
  select: typeof runSummarySelect;
}>;

/** Default page for the workspace dashboard. */
const RECENT_LIMIT = 20;

export function listRecentRuns(
  db: PrismaClient,
  workspaceId: string,
  limit: number = RECENT_LIMIT,
): Promise<RunSummary[]> {
  return db.run.findMany({
    where: { program: { project: { workspaceId } } },
    select: runSummarySelect,
    // startedAt, not finishedAt: a run still going is the one most worth
    // seeing, and it has no finishedAt to sort by.
    orderBy: { startedAt: "desc" },
    take: limit,
  });
}

/** One program's history. Same shape as the dashboard list, minus the filter. */
export function listRunsForProgram(
  db: PrismaClient,
  programId: string,
  limit: number = RECENT_LIMIT,
): Promise<RunSummary[]> {
  return db.run.findMany({
    where: { programId },
    select: runSummarySelect,
    orderBy: { startedAt: "desc" },
    take: limit,
  });
}

/**
 * Runs ever started in a workspace.
 *
 * Not the same number as the quota's usedRuns, which counts one month and is
 * reset. Both are worth showing and neither can stand in for the other.
 */
export function countRuns(db: PrismaClient, workspaceId: string): Promise<number> {
  return db.run.count({ where: { program: { project: { workspaceId } } } });
}

export interface RunEventInput {
  seq: number;
  kind: string;
  payload: Prisma.InputJsonValue;
}

/**
 * Store a batch of decision-log events.
 *
 * skipDuplicates leans on the [runId, seq] unique. A stream resumed after a
 * partial write replays events that are already stored, and dropping those is
 * right where failing the batch would throw away the rest of the run.
 */
export async function appendRunEvents(
  db: PrismaClient,
  runId: string,
  events: readonly RunEventInput[],
): Promise<number> {
  if (events.length === 0) return 0;

  const result = await db.runEvent.createMany({
    data: events.map((event) => ({
      runId,
      seq: event.seq,
      kind: event.kind,
      payload: event.payload,
    })),
    skipDuplicates: true,
  });
  return result.count;
}

/**
 * What the run turned out to be. Only the status is required, and an omitted
 * field is left as it is rather than cleared, so finishing a run that died late
 * does not wipe the measurements it had already taken. finishedAt is the
 * exception: it defaults to now, because finalizing is what ends a run.
 */
export interface RunOutcome {
  status: RunStatus;
  costBefore?: number | null;
  costAfter?: number | null;
  outputMatch?: boolean | null;
  finalProof?: string | null;
  error?: string | null;
  finishedAt?: Date;
}

export function finalizeRun(
  db: PrismaClient,
  runId: string,
  outcome: RunOutcome,
): Promise<Run> {
  return db.run.update({
    where: { id: runId },
    data: {
      status: outcome.status,
      costBefore: outcome.costBefore,
      costAfter: outcome.costAfter,
      outputMatch: outcome.outputMatch,
      finalProof: outcome.finalProof,
      error: outcome.error,
      finishedAt: outcome.finishedAt ?? new Date(),
    },
  });
}
