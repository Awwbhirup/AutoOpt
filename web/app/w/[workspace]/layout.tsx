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
import { requireWorkspace } from "@/lib/workspace";

export default async function WorkspaceLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ workspace: string }>;
}) {
  const { workspace: slug } = await params;
  const { workspace, role, user } = await requireWorkspace(slug);

  return (
    <>
      <WorkspaceHeader workspace={workspace} role={role} user={user} />
      {children}
    </>
  );
}
