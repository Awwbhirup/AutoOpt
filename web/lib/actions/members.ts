"use server";

/**
 * Adding someone to a workspace, changing what they may do, and removing them.
 *
 * Every one of these resolves the caller's role against the slug in the form
 * and asks authorize() before touching a row, the same way project and program
 * creation do. The slug is the string the URL carries and is trusted no
 * further than that.
 *
 * There is no invitation: the schema has Membership and no pending-invite row,
 * so someone can only be added once they have an account. That is a real limit
 * and the form says so rather than failing mysteriously on an unknown address.
 */

import { revalidatePath } from "next/cache";

import { auth } from "../../auth";
import { authorize, ROLES, type Principal, type Role } from "../authorize";
import { prisma } from "../db";
import { record } from "../repositories/audit";
import {
  addMember,
  findMember,
  findUserByEmail,
  removeMember as deleteMember,
  setMemberRole,
  wouldOrphanWorkspace,
} from "../repositories/members";
import { findWorkspaceBySlug } from "../repositories/workspaces";
import { principalFor } from "../session";
import {
  type ActionState,
  created,
  failed,
  field,
  isUniqueViolation,
  NO_WORKSPACE,
  SIGNED_OUT,
} from "./form";

const LAST_OWNER =
  "This is the only owner. Make someone else an owner first, or the workspace " +
  "would be left with nobody who can administer it.";

function isRole(value: string): value is Role {
  return (ROLES as readonly string[]).includes(value);
}

/**
 * What every action here needs before it can decide anything.
 *
 * Returns either the refusal to hand back or the facts to act on. Shared
 * because three actions asking the same four questions in three places is
 * three chances for one of them to skip the fourth.
 */
type Resolved =
  | { ok: false; refusal: ActionState }
  | { ok: true; workspace: { id: string; slug: string }; principal: Principal };

async function resolve(
  form: FormData,
  action: Parameters<typeof authorize>[1],
): Promise<Resolved> {
  const slug = field(form, "workspace");

  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return { ok: false, refusal: failed(SIGNED_OUT) };

  const workspace = await findWorkspaceBySlug(prisma, slug, userId);
  if (workspace === null) return { ok: false, refusal: failed(NO_WORKSPACE) };

  const principal = await principalFor(prisma, userId, workspace.id);
  if (!authorize(principal, action)) {
    // A non-member is told what a stranger is told. Someone already here knows
    // the workspace exists, so they get the real reason.
    return {
      ok: false,
      refusal: failed(
        principal.role === null
          ? NO_WORKSPACE
          : "Your role in this workspace does not allow managing people.",
      ),
    };
  }

  return { ok: true, workspace, principal };
}

export async function addWorkspaceMember(
  _previous: ActionState,
  form: FormData,
): Promise<ActionState> {
  const email = field(form, "email").toLowerCase();
  const role = field(form, "role") || "MEMBER";

  const resolved = await resolve(form, "member:invite");
  if (!resolved.ok) return resolved.refusal;
  const { workspace, principal } = resolved;

  if (!email) return failed("Enter the email address of the person to add.");
  if (!isRole(role)) return failed("Pick a role from the list.");
  // Only an OWNER may hand out their own level. An ADMIN promoting someone to
  // OWNER would be granting authority they do not hold, including over
  // themselves.
  if (role === "OWNER" && principal.role !== "OWNER") {
    return failed("Only an owner can make someone else an owner.");
  }

  const user = await findUserByEmail(prisma, email);
  if (user === null) {
    return failed(
      "Nobody with that email has an account yet. They need to sign up first.",
    );
  }

  try {
    const membership = await addMember(prisma, {
      workspaceId: workspace.id,
      userId: user.id,
      role,
    });
    await record(prisma, {
      workspaceId: workspace.id,
      actorId: principal.userId,
      action: "member.added",
      resourceType: "membership",
      resourceId: membership.id,
      metadata: { email, role },
    });
    revalidatePath(`/w/${workspace.slug}/settings`);
    return created(membership.id);
  } catch (error) {
    if (isUniqueViolation(error)) {
      return failed("That person is already in this workspace.");
    }
    throw error;
  }
}

export async function changeWorkspaceMemberRole(
  _previous: ActionState,
  form: FormData,
): Promise<ActionState> {
  const targetUserId = field(form, "userId");
  const role = field(form, "role");

  const resolved = await resolve(form, "member:changeRole");
  if (!resolved.ok) return resolved.refusal;
  const { workspace, principal } = resolved;

  if (!isRole(role)) return failed("Pick a role from the list.");

  const target = await findMember(prisma, workspace.id, targetUserId);
  if (target === null) return failed("That person is not in this workspace.");
  if (target.role === role) return created(target.id);

  if (
    (role === "OWNER" || target.role === "OWNER") &&
    principal.role !== "OWNER"
  ) {
    return failed("Only an owner can add or remove owners.");
  }
  if (await wouldOrphanWorkspace(prisma, workspace.id, target, role)) {
    return failed(LAST_OWNER);
  }

  await setMemberRole(prisma, {
    workspaceId: workspace.id,
    userId: targetUserId,
    role,
  });
  await record(prisma, {
    workspaceId: workspace.id,
    actorId: principal.userId,
    action: "member.role_changed",
    resourceType: "membership",
    resourceId: target.id,
    metadata: { email: target.user.email, from: target.role, to: role },
  });
  revalidatePath(`/w/${workspace.slug}/settings`);
  return created(target.id);
}

export async function removeWorkspaceMember(
  _previous: ActionState,
  form: FormData,
): Promise<ActionState> {
  const targetUserId = field(form, "userId");

  const resolved = await resolve(form, "member:remove");
  if (!resolved.ok) return resolved.refusal;
  const { workspace, principal } = resolved;

  const target = await findMember(prisma, workspace.id, targetUserId);
  if (target === null) return failed("That person is not in this workspace.");

  if (target.role === "OWNER" && principal.role !== "OWNER") {
    return failed("Only an owner can remove an owner.");
  }
  if (await wouldOrphanWorkspace(prisma, workspace.id, target, null)) {
    return failed(LAST_OWNER);
  }

  await deleteMember(prisma, { workspaceId: workspace.id, userId: targetUserId });
  await record(prisma, {
    workspaceId: workspace.id,
    actorId: principal.userId,
    action: "member.removed",
    resourceType: "membership",
    resourceId: target.id,
    metadata: { email: target.user.email, role: target.role },
  });
  revalidatePath(`/w/${workspace.slug}/settings`);
  return created(target.id);
}
