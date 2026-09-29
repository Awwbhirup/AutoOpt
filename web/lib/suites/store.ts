/**
 * The executor's queue, kept in Postgres.
 *
 * The claim is one UPDATE whose subquery locks the row it picks with SKIP
 * LOCKED, so two workers asking at once get two different runs, or one gets
 * none. Order comes from the position written into each run's config when the
 * suite run was planned.
 */

import type { PrismaClient, RunStatus } from "@prisma/client";

import type { ClaimedRun, SuiteStore } from "./executor";

const FINAL: ReadonlySet<RunStatus> = new Set(["SUCCEEDED", "FAILED", "ABANDONED"]);

function readConfig(config: unknown): { proveFinal: boolean } {
  if (config !== null && typeof config === "object" && !Array.isArray(config)) {
    return { proveFinal: (config as Record<string, unknown>).proveFinal === true };
  }
  return { proveFinal: false };
}

export function prismaSuiteStore(db: PrismaClient): SuiteStore {
  return {
    async claimNext(suiteRunId: string): Promise<ClaimedRun | null> {
      const claimed = await db.$queryRaw<{ id: string }[]>`
        UPDATE "Run" SET "status" = 'RUNNING', "startedAt" = now()
        WHERE "id" = (
          SELECT "id" FROM "Run"
          WHERE "suiteRunId" = ${suiteRunId} AND "status" = 'QUEUED'
          ORDER BY (("config"->>'order')::int) ASC NULLS LAST, "id" ASC
          LIMIT 1
          FOR UPDATE SKIP LOCKED
        )
        RETURNING "id"`;
      if (claimed.length === 0) return null;

      const run = await db.run.findUniqueOrThrow({
        where: { id: claimed[0].id },
        select: {
          id: true,
          method: true,
          seed: true,
          config: true,
          program: { select: { id: true, source: true, category: true } },
        },
      });
      await db.suiteRun.updateMany({
        where: { id: suiteRunId, status: "QUEUED" },
        data: { status: "RUNNING" },
      });

      return {
        runId: run.id,
        programId: run.program.id,
        source: run.program.source,
        category: run.program.category,
        method: run.method,
        seed: run.seed,
        proveFinal: readConfig(run.config).proveFinal,
      };
    },

    async requeue(runId: string): Promise<void> {
      await db.run.updateMany({ where: { id: runId, status: "RUNNING" }, data: { status: "QUEUED" } });
    },

    async sweepStale(suiteRunId: string, before: Date): Promise<number> {
      const result = await db.run.updateMany({
        where: { suiteRunId, status: "RUNNING", startedAt: { lt: before } },
        data: {
          status: "ABANDONED",
          error: "the worker running it stopped before it finished",
          finishedAt: new Date(),
        },
      });
      return result.count;
    },

    async refresh(suiteRunId: string) {
      const counts = await db.run.groupBy({
        by: ["status"],
        where: { suiteRunId },
        _count: { _all: true },
      });
      const count = (status: RunStatus) =>
        counts.find((entry) => entry.status === status)?._count._all ?? 0;
      const total = counts.reduce((sum, entry) => sum + entry._count._all, 0);
      const remaining = count("QUEUED") + count("RUNNING");

      const current = await db.suiteRun.findUniqueOrThrow({
        where: { id: suiteRunId },
        select: { status: true },
      });
      // A cancelled suite stays cancelled; only its counts move.
      let status: RunStatus = current.status;
      if (!FINAL.has(current.status) && remaining === 0) {
        status = count("SUCCEEDED") > 0 ? "SUCCEEDED" : count("FAILED") > 0 ? "FAILED" : "ABANDONED";
      }

      await db.suiteRun.update({
        where: { id: suiteRunId },
        data: {
          total,
          completed: total - remaining,
          status,
          ...(FINAL.has(status) && !FINAL.has(current.status) ? { finishedAt: new Date() } : {}),
        },
      });
      return { remaining, status };
    },
  };
}
