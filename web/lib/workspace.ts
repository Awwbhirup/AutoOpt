/**
 * Turning the slug in /w/[workspace] into something a page is allowed to read.
 *
 * A layout cannot hand values to the pages under it, so every page resolves the
 * workspace for itself. React's cache makes that one resolution per request
 * rather than one per component that asks.
 *
 * A non-member is refused exactly the way a stranger naming a workspace that
 * does not exist is refused. Which workspaces exist is itself something they
 * are not entitled to, and a 403 answers that question while claiming not to.
 */

import type { PrismaClient } from "@prisma/client";
import { notFound, redirect } from "next/navigation";
import { cache } from "react";

import { auth } from "../auth";
import type { Principal, Role } from "./authorize";
import { prisma } from "./db";
import {
  findWorkspaceBySlug,
  type WorkspaceForCaller,
} from "./repositories/workspaces";
import { principalFor } from "./session";

export interface WorkspaceAccess {
  workspace: WorkspaceForCaller;
  principal: Principal;
  /** The same role as the principal's, narrowed: a null one never gets here. */
  role: Role;
}

export interface SignedInUser {
  id: string;
  name: string | null;
  email: string | null;
  image: string | null;
}

export interface WorkspacePage extends WorkspaceAccess {
  user: SignedInUser;
}

/**
 * The workspace and the caller's standing in it, or null for both kinds of no.
 *
 * Separate from requireWorkspace below so that the rule it encodes can be
 * tested without a request around it.
 */
export async function resolveWorkspace(
  db: PrismaClient,
  userId: string,
  slug: string,
): Promise<WorkspaceAccess | null> {
  const workspace = await findWorkspaceBySlug(db, slug, userId);
  if (workspace === null) return null;

  // Read through session.ts rather than taken from the membership the lookup
  // above already returned. One place builds a Principal, so no call site can
  // authorize against a role it assembled itself.
  const principal = await principalFor(db, userId, workspace.id);
  if (principal.role === null) return null;

  return { workspace, principal, role: principal.role };
}

/**
 * What every page under /w/[workspace] starts with.
 *
 * Signed out is a redirect and not a 404, because there is a useful thing to do
 * about it.
 */
export const requireWorkspace = cache(
  async (slug: string): Promise<WorkspacePage> => {
    const session = await auth();
    const user = session?.user;
    // The application's own sign-in page, not the one Auth.js serves under
    // /api/auth. Where it lands afterwards is its decision, so the workspace
    // they were heading for is not carried across.
    if (!user?.id) redirect("/signin");

    const access = await resolveWorkspace(prisma, user.id, slug);
    if (access === null) notFound();

    return {
      ...access,
      user: {
        id: user.id,
        name: user.name ?? null,
        email: user.email ?? null,
        image: user.image ?? null,
      },
    };
  },
);
