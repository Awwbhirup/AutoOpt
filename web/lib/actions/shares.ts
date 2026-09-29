"use server";

/**
 * Creating and revoking share links.
 *
 * A link is created against a run or a suite run the caller can already see,
 * in their workspace, and published to anyone who holds it. Revoking is an
 * administrative act (see the permission table), and both are written to the
 * audit log, since a link takes workspace data outside the workspace.
 */

import { revalidatePath } from "next/cache";

import { auth } from "../../auth";
import { authorize } from "../authorize";
import { prisma } from "../db";
import { record } from "../repositories/audit";
import { findShareById, workspaceOf } from "../repositories/shares";
import { findWorkspaceBySlug } from "../repositories/workspaces";
import { principalFor } from "../session";
import { expiryFrom, newShareToken, sharePath } from "../shares";
import { type ActionState, created, failed, field, NO_WORKSPACE, SIGNED_OUT } from "./form";

async function callerIn(slug: string) {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return { error: SIGNED_OUT } as const;
  const workspace = await findWorkspaceBySlug(prisma, slug, userId);
  if (workspace === null) return { error: NO_WORKSPACE } as const;
  const principal = await principalFor(prisma, userId, workspace.id);
  if (principal.role === null) return { error: NO_WORKSPACE } as const;
  return { userId, principal, workspace } as const;
}

/** Answers with the new token in createdId, which is what the dialog shows. */
export async function createShareLink(_previous: ActionState, form: FormData): Promise<ActionState> {
  const caller = await callerIn(field(form, "workspace"));
  if ("error" in caller) return failed(caller.error ?? NO_WORKSPACE);
  if (!authorize(caller.principal, "share:create")) {
    return failed("Your role in this workspace does not allow sharing.");
  }

  const expiresAt = expiryFrom(field(form, "expires") || "never", new Date());
  if (expiresAt === undefined) return failed("Pick when the link should stop working.");

  const runId = field(form, "runId");
  const suiteRunId = field(form, "suiteRunId");
  let label: string;

  if (runId) {
    const run = await prisma.run.findUnique({
      where: { id: runId },
      select: { method: true, program: { select: { name: true, project: { select: { workspaceId: true } } } } },
    });
    if (run === null || run.program.project.workspaceId !== caller.workspace.id) return failed("No such run.");
    label = `run of ${run.program.name} (${run.method})`;
  } else if (suiteRunId) {
    const suiteRun = await prisma.suiteRun.findUnique({
      where: { id: suiteRunId },
      select: { suite: { select: { name: true, workspaceId: true } } },
    });
    if (suiteRun === null || suiteRun.suite.workspaceId !== caller.workspace.id) {
      return failed("No such suite run.");
    }
    label = `results of ${suiteRun.suite.name}`;
  } else {
    return failed("Nothing to share.");
  }

  const link = await prisma.shareLink.create({
    data: {
      token: newShareToken(),
      runId: runId || null,
      suiteRunId: runId ? null : suiteRunId,
      createdById: caller.userId,
      expiresAt,
    },
    select: { id: true, token: true },
  });

  await record(prisma, {
    workspaceId: caller.workspace.id,
    actorId: caller.userId,
    action: "share.created",
    resourceType: "ShareLink",
    resourceId: link.id,
    metadata: { label, expiresAt: expiresAt?.toISOString() ?? null },
  });

  revalidatePath(`/w/${caller.workspace.slug}`, "layout");
  return created(link.token);
}

export async function revokeShareLink(_previous: ActionState, form: FormData): Promise<ActionState> {
  const caller = await callerIn(field(form, "workspace"));
  if ("error" in caller) return failed(caller.error ?? NO_WORKSPACE);

  const share = await findShareById(prisma, field(form, "shareId"));
  if (share === null || workspaceOf(share) !== caller.workspace.id) return failed("No such link.");
  if (!authorize(caller.principal, "share:revoke")) {
    return failed("Only an admin or owner can revoke a shared link.");
  }
  if (share.revokedAt !== null) return created(share.id);

  await prisma.shareLink.update({ where: { id: share.id }, data: { revokedAt: new Date() } });
  await record(prisma, {
    workspaceId: caller.workspace.id,
    actorId: caller.userId,
    action: "share.revoked",
    resourceType: "ShareLink",
    resourceId: share.id,
    metadata: { label: sharePath(share.token) },
  });

  revalidatePath(`/w/${caller.workspace.slug}`, "layout");
  return created(share.id);
}
