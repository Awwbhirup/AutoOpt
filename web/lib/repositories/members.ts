/**
 * Membership reads and writes.
 *
 * Nothing here decides whether the caller may do what it is being asked to do.
 * These answer "what is there" and "make it so"; authorize() answers "may you".
 *
 * The one rule that does live here is the last owner. It is not a permission
 * question: an ADMIN removing the last OWNER is acting within their role, and
 * the result is still a workspace nobody can administer. A rule that holds
 * regardless of who is asking belongs with the data, not with the permissions.
 */

import type { Prisma, PrismaClient } from "@prisma/client";

import type { Role } from "../authorize";

const memberSelect = {
  id: true,
  role: true,
  createdAt: true,
  userId: true,
  user: { select: { id: true, name: true, email: true, image: true } },
} satisfies Prisma.MembershipSelect;

export type WorkspaceMember = Prisma.MembershipGetPayload<{
  select: typeof memberSelect;
}>;

/**
 * Everyone in the workspace, owners first.
 *
 * Ordered by role and then by how long they have been here, so the list reads
 * as a hierarchy rather than as insertion order. Prisma sorts an enum by its
 * declaration order, and Role is declared OWNER first for exactly this.
 */
export function listMembers(
  db: PrismaClient,
  workspaceId: string,
): Promise<WorkspaceMember[]> {
  return db.membership.findMany({
    where: { workspaceId },
    select: memberSelect,
    orderBy: [{ role: "asc" }, { createdAt: "asc" }],
  });
}

export function findMember(
  db: PrismaClient,
  workspaceId: string,
  userId: string,
): Promise<WorkspaceMember | null> {
  return db.membership.findUnique({
    where: { userId_workspaceId: { userId, workspaceId } },
    select: memberSelect,
  });
}

export function findUserByEmail(
  db: PrismaClient,
  email: string,
): Promise<{ id: string; email: string; name: string | null } | null> {
  return db.user.findUnique({
    where: { email },
    select: { id: true, email: true, name: true },
  });
}

export function countOwners(db: PrismaClient, workspaceId: string): Promise<number> {
  return db.membership.count({ where: { workspaceId, role: "OWNER" } });
}

/**
 * Would this change leave the workspace with no owner?
 *
 * Asked before a removal and before a demotion, because both reach the same
 * end. A workspace with no OWNER cannot be deleted, cannot have its settings
 * changed and cannot promote anyone to fix it, so there is no route back from
 * it through the application: the only repair is someone with database access.
 */
export async function wouldOrphanWorkspace(
  db: PrismaClient,
  workspaceId: string,
  target: { role: Role },
  becoming: Role | null,
): Promise<boolean> {
  if (target.role !== "OWNER") return false;
  if (becoming === "OWNER") return false;
  return (await countOwners(db, workspaceId)) <= 1;
}

export function addMember(
  db: PrismaClient,
  input: { workspaceId: string; userId: string; role: Role },
): Promise<{ id: string }> {
  return db.membership.create({
    data: input,
    select: { id: true },
  });
}

export function setMemberRole(
  db: PrismaClient,
  input: { workspaceId: string; userId: string; role: Role },
): Promise<{ id: string }> {
  return db.membership.update({
    where: {
      userId_workspaceId: { userId: input.userId, workspaceId: input.workspaceId },
    },
    data: { role: input.role },
    select: { id: true },
  });
}

export function removeMember(
  db: PrismaClient,
  input: { workspaceId: string; userId: string },
): Promise<{ id: string }> {
  return db.membership.delete({
    where: {
      userId_workspaceId: { userId: input.userId, workspaceId: input.workspaceId },
    },
    select: { id: true },
  });
}
