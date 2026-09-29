/**
 * What a share token opens, resolved once per request (the page and its
 * metadata both ask). Unknown tokens are null; revoked or expired ones say so,
 * without revealing what they used to share.
 */

import { cache } from "react";

import { prisma } from "./db";
import { readGrid } from "./suites/grid";
import { summarizeSuite, type SuiteResults } from "./suites/results";
import { listSuiteRunRows } from "./repositories/suites";
import { shareState, TOKEN_PATTERN } from "./shares";

export type SharedView =
  | { kind: "gone"; reason: "revoked" | "expired" }
  | {
      kind: "run";
      shareId: string;
      run: NonNullable<Awaited<ReturnType<typeof loadRun>>>;
    }
  | {
      kind: "suite";
      shareId: string;
      suiteRun: NonNullable<Awaited<ReturnType<typeof loadSuiteRun>>>;
      results: SuiteResults;
    };

function loadRun(runId: string) {
  return prisma.run.findUnique({
    where: { id: runId },
    select: {
      id: true,
      method: true,
      seed: true,
      status: true,
      error: true,
      costBefore: true,
      costAfter: true,
      outputMatch: true,
      finalProof: true,
      startedAt: true,
      finishedAt: true,
      program: { select: { name: true, category: true, source: true } },
      events: { select: { payload: true }, orderBy: { seq: "asc" } },
    },
  });
}

function loadSuiteRun(suiteRunId: string) {
  return prisma.suiteRun.findUnique({
    where: { id: suiteRunId },
    select: {
      id: true,
      status: true,
      total: true,
      grid: true,
      startedAt: true,
      suite: { select: { name: true, description: true } },
    },
  });
}

export const loadSharedView = cache(async (token: string): Promise<SharedView | null> => {
  if (!TOKEN_PATTERN.test(token)) return null;
  const link = await prisma.shareLink.findUnique({
    where: { token },
    select: { id: true, runId: true, suiteRunId: true, revokedAt: true, expiresAt: true },
  });
  if (link === null) return null;

  const state = shareState(link, new Date());
  if (state !== "active") return { kind: "gone", reason: state };

  if (link.runId !== null) {
    const run = await loadRun(link.runId);
    return run === null ? null : { kind: "run", shareId: link.id, run };
  }
  if (link.suiteRunId !== null) {
    const suiteRun = await loadSuiteRun(link.suiteRunId);
    if (suiteRun === null) return null;
    const rows = await listSuiteRunRows(prisma, suiteRun.id);
    return {
      kind: "suite",
      shareId: link.id,
      suiteRun,
      results: summarizeSuite(rows, readGrid(suiteRun.grid).methods),
    };
  }
  return null;
});
