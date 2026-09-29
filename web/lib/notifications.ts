/**
 * In-app notifications: what they say, and writing and reading them.
 *
 * Writing is best-effort, like the audit log: the thing being announced has
 * already happened, and a notification that failed to save must not undo it
 * or surface as its error.
 */

import type { PrismaClient, RunStatus } from "@prisma/client";

export type NotificationKind = "suite.finished" | "member.added";

export interface NotificationDraft {
  userId: string;
  workspaceId: string | null;
  kind: NotificationKind;
  title: string;
  body: string | null;
  href: string | null;
}

export function suiteFinishedNotice(input: {
  userId: string;
  workspace: { id: string; slug: string };
  suite: { id: string; name: string };
  suiteRunId: string;
  status: RunStatus;
  succeeded: number;
  total: number;
}): NotificationDraft {
  const failed = input.status !== "SUCCEEDED";
  return {
    userId: input.userId,
    workspaceId: input.workspace.id,
    kind: "suite.finished",
    title: failed ? `${input.suite.name} did not finish cleanly` : `${input.suite.name} finished`,
    body: `${input.succeeded} of ${input.total} ${input.total === 1 ? "run" : "runs"} succeeded.`,
    href: `/w/${input.workspace.slug}/suites/${input.suite.id}/runs/${input.suiteRunId}`,
  };
}

export function memberAddedNotice(input: {
  userId: string;
  workspace: { id: string; slug: string; name: string };
  role: string;
  by: string | null;
}): NotificationDraft {
  return {
    userId: input.userId,
    workspaceId: input.workspace.id,
    kind: "member.added",
    title: `You were added to ${input.workspace.name}`,
    body: `${input.by ?? "Someone"} added you as ${input.role.toLowerCase()}.`,
    href: `/w/${input.workspace.slug}`,
  };
}

export async function notify(db: PrismaClient, draft: NotificationDraft): Promise<boolean> {
  try {
    await db.notification.create({ data: draft });
    return true;
  } catch (error) {
    console.error("notification not recorded", draft.kind, error);
    return false;
  }
}

export interface NotificationEntry {
  id: string;
  kind: string;
  title: string;
  body: string | null;
  href: string | null;
  read: boolean;
  createdAt: string;
}

export async function listNotifications(db: PrismaClient, userId: string, take = 15): Promise<NotificationEntry[]> {
  const rows = await db.notification.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
    take,
    select: { id: true, kind: true, title: true, body: true, href: true, readAt: true, createdAt: true },
  });
  return rows.map((row) => ({
    id: row.id,
    kind: row.kind,
    title: row.title,
    body: row.body,
    href: row.href,
    read: row.readAt !== null,
    createdAt: row.createdAt.toISOString(),
  }));
}

export function unreadCount(db: PrismaClient, userId: string): Promise<number> {
  return db.notification.count({ where: { userId, readAt: null } });
}
