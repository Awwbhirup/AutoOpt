/**
 * The audit log: what was done, by whom, to what.
 *
 * Entries name their subject by type and id rather than by foreign key, so an
 * entry outlives the thing it describes. An audit trail that loses its rows
 * when someone deletes the evidence is not one.
 *
 * Writing is deliberately forgiving and reading is not. A failed write must not
 * undo the thing it was recording: refusing a role change because the log was
 * unreachable would be a worse outcome than a gap in the log, and the gap is
 * visible while a silently reverted change is not.
 */

import type { Prisma, PrismaClient } from "@prisma/client";

/** The things worth recording. Kept narrow on purpose: a log of everything is read by nobody. */
export type AuditAction =
  | "member.added"
  | "member.role_changed"
  | "member.removed";

export interface AuditEntry {
  workspaceId: string;
  actorId: string | null;
  action: AuditAction;
  resourceType: string;
  resourceId: string;
  metadata?: Prisma.InputJsonValue;
}

const entrySelect = {
  id: true,
  action: true,
  resourceType: true,
  resourceId: true,
  metadata: true,
  createdAt: true,
  actor: { select: { id: true, name: true, email: true } },
} satisfies Prisma.AuditLogSelect;

export type AuditLogEntry = Prisma.AuditLogGetPayload<{
  select: typeof entrySelect;
}>;

/**
 * Record one action, or carry on without it.
 *
 * Returns whether it landed, so a caller that does care can say so, without
 * making every caller handle a failure that should not stop them.
 */
export async function record(db: PrismaClient, entry: AuditEntry): Promise<boolean> {
  try {
    await db.auditLog.create({ data: { ...entry } });
    return true;
  } catch (error) {
    // Nowhere to escalate to: the caller's work is already done, and the log
    // is the thing that failed. Console is what a server has.
    console.error("audit entry not recorded", entry.action, error);
    return false;
  }
}

/**
 * The most recent entries for a workspace.
 *
 * Newest first, and capped. There is no pagination yet, and a page that tried
 * to render a year of a busy workspace without one would be the slowest thing
 * in the application.
 */
export function listEntries(
  db: PrismaClient,
  workspaceId: string,
  take = 100,
): Promise<AuditLogEntry[]> {
  return db.auditLog.findMany({
    where: { workspaceId },
    select: entrySelect,
    orderBy: { createdAt: "desc" },
    take,
  });
}
