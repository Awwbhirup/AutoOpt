/**
 * Everything under /w/[workspace] is signed in and inside one workspace.
 *
 * This is not the gate, though it looks like one. Next renders a layout beside
 * the page under it rather than before it, so each page resolves the same
 * access for itself. requireWorkspace is cached per request, which makes the
 * repetition one lookup rather than one per component that asks.
 */

import type { ReactNode } from "react";

import { WorkspaceHeader } from "@/components/shell/header";
import { AppFrame } from "@/components/app/frame";
import { authorize } from "@/lib/authorize";
import { prisma } from "@/lib/db";
import { listWorkspacesForUser } from "@/lib/repositories/workspaces";
import { requireWorkspace } from "@/lib/workspace";

export default async function WorkspaceLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ workspace: string }>;
}) {
  const { workspace: slug } = await params;
  const { workspace, role, user, principal } = await requireWorkspace(slug);
  const memberships = await listWorkspacesForUser(prisma, user.id);

  return (
    <AppFrame>
      <WorkspaceHeader
        workspace={workspace}
        role={role}
        user={user}
        mayAudit={authorize(principal, "auditLog:view")}
        workspaces={memberships.map((entry) => ({
          slug: entry.workspace.slug,
          name: entry.workspace.name,
          role: entry.role,
        }))}
      />
      {children}
    </AppFrame>
  );
}
