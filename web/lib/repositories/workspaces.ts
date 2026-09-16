/**
 * Workspace reads.
 *
 * Nothing in the repositories decides whether the caller may see what comes
 * back. These answer "what is there", authorize() answers "may you", and
 * folding the second into the first is how one query ends up being the only
 * one that checks, or the only one that forgot.
 */

import type { Prisma, PrismaClient } from "@prisma/client";

const workspaceFields = {
  id: true,
  name: true,
  slug: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.WorkspaceSelect;

const membershipEntrySelect = {
  role: true,
  createdAt: true,
  workspace: { select: workspaceFields },
} satisfies Prisma.MembershipSelect;

export type WorkspaceEntry = Prisma.MembershipGetPayload<{
  select: typeof membershipEntrySelect;
}>;

/**
 * The workspaces this user belongs to, each with the role they hold in it.
 *
 * Asked of Membership rather than Workspace because the role is half the
 * answer, and reaching it from the other side means unwrapping a filtered
 * array of one at the call site.
 */
export function listWorkspacesForUser(
  db: PrismaClient,
  userId: string,
): Promise<WorkspaceEntry[]> {
  return db.membership.findMany({
    where: { userId },
    select: membershipEntrySelect,
    orderBy: { workspace: { name: "asc" } },
  });
}

const callerMembershipSelect = {
  id: true,
  userId: true,
  role: true,
  createdAt: true,
} satisfies Prisma.MembershipSelect;

export type CallerMembership = Prisma.MembershipGetPayload<{
  select: typeof callerMembershipSelect;
}>;

export type WorkspaceForCaller = Prisma.WorkspaceGetPayload<{
  select: typeof workspaceFields;
}> & { membership: CallerMembership | null };

/**
 * A workspace by its slug, along with the caller's membership of it if any.
 *
 * The membership comes back null for a non-member instead of the workspace
 * coming back null, because "exists but not yours" and "does not exist" are
 * different facts and only the caller knows which one the response should
 * admit to.
 */
export async function findWorkspaceBySlug(
  db: PrismaClient,
  slug: string,
  userId: string,
): Promise<WorkspaceForCaller | null> {
  const row = await db.workspace.findUnique({
    where: { slug },
    select: {
      ...workspaceFields,
      // At most one row, by the [userId, workspaceId] unique. Flattened below
      // so nothing downstream reads a role out of a one-element array.
      memberships: { where: { userId }, select: callerMembershipSelect },
    },
  });
  if (row === null) return null;

  const { memberships, ...workspace } = row;
  return { ...workspace, membership: memberships[0] ?? null };
}

const quotaSelect = {
  monthlyRuns: true,
  usedRuns: true,
  periodStart: true,
  updatedAt: true,
} satisfies Prisma.QuotaSelect;

export type WorkspaceQuota = Prisma.QuotaGetPayload<{
  select: typeof quotaSelect;
}>;

/**
 * The workspace's run allowance for the current period.
 *
 * Null where no row has been written, which is a workspace nobody has put a
 * limit on. A caller that reads that as zero remaining would stop a workspace
 * that was never restricted.
 */
export function findQuota(
  db: PrismaClient,
  workspaceId: string,
): Promise<WorkspaceQuota | null> {
  return db.quota.findUnique({
    where: { workspaceId },
    select: quotaSelect,
  });
}
