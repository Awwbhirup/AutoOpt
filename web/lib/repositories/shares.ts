/**
 * Share link reads. The public page resolves a token to exactly what it
 * shares and nothing next to it; the workspace pages list and manage links.
 */

import type { Prisma, PrismaClient } from "@prisma/client";

const shareListSelect = {
  id: true,
  token: true,
  runId: true,
  suiteRunId: true,
  expiresAt: true,
  revokedAt: true,
  viewCount: true,
  lastViewedAt: true,
  createdAt: true,
  createdById: true,
  createdBy: { select: { name: true, email: true } },
  run: { select: { id: true, method: true, program: { select: { name: true } } } },
  suiteRun: { select: { id: true, suite: { select: { id: true, name: true } } } },
} satisfies Prisma.ShareLinkSelect;

export type ShareListEntry = Prisma.ShareLinkGetPayload<{ select: typeof shareListSelect }>;

export function listSharesForTarget(
  db: PrismaClient,
  target: { runId: string } | { suiteRunId: string },
): Promise<ShareListEntry[]> {
  return db.shareLink.findMany({
    where: target,
    select: shareListSelect,
    orderBy: { createdAt: "desc" },
  });
}

export function listSharesInWorkspace(db: PrismaClient, workspaceId: string): Promise<ShareListEntry[]> {
  return db.shareLink.findMany({
    where: {
      OR: [
        { run: { program: { project: { workspaceId } } } },
        { suiteRun: { suite: { workspaceId } } },
      ],
    },
    select: shareListSelect,
    orderBy: { createdAt: "desc" },
    take: 200,
  });
}

const shareTargetSelect = {
  id: true,
  token: true,
  expiresAt: true,
  revokedAt: true,
  runId: true,
  suiteRunId: true,
  run: { select: { program: { select: { project: { select: { workspaceId: true } } } } } },
  suiteRun: { select: { suite: { select: { workspaceId: true } } } },
} satisfies Prisma.ShareLinkSelect;

export type ShareTarget = Prisma.ShareLinkGetPayload<{ select: typeof shareTargetSelect }>;

export function findShareByToken(db: PrismaClient, token: string): Promise<ShareTarget | null> {
  return db.shareLink.findUnique({ where: { token }, select: shareTargetSelect });
}

export function findShareById(db: PrismaClient, id: string): Promise<ShareTarget & { createdById: string | null } | null> {
  return db.shareLink.findUnique({
    where: { id },
    select: { ...shareTargetSelect, createdById: true },
  });
}

/** The workspace a link belongs to, through whichever thing it shares. */
export function workspaceOf(share: ShareTarget): string | null {
  return share.run?.program.project.workspaceId ?? share.suiteRun?.suite.workspaceId ?? null;
}

/** Counted without waiting on it: a view that fails to count is still a view. */
export async function countView(db: PrismaClient, id: string): Promise<void> {
  try {
    await db.shareLink.update({
      where: { id },
      data: { viewCount: { increment: 1 }, lastViewedAt: new Date() },
    });
  } catch (error) {
    console.error("share view not counted", error);
  }
}
