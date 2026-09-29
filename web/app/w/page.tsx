/**
 * Where signing in lands: straight into the workspace when there is one, a
 * choice when there are several.
 *
 * A first-time GitHub user arrives here without having passed through the
 * password actions that provision a workspace, so this makes sure there is
 * one before choosing.
 */

import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { auth } from "@/auth";
import { AppFrame, PageMain } from "@/components/app/frame";
import { PageHeader } from "@/components/ui/surface";
import { ensureWorkspaceForUser } from "@/lib/actions/auth";
import { prisma } from "@/lib/db";
import { listWorkspacesForUser } from "@/lib/repositories/workspaces";

export const metadata: Metadata = {
  title: "Workspaces",
  description: "The workspaces you belong to.",
};

export default async function WorkspacesIndex() {
  const session = await auth();
  const user = session?.user;
  if (!user?.id) redirect("/signin");

  let memberships = await listWorkspacesForUser(prisma, user.id);
  if (memberships.length === 0 && user.email) {
    await ensureWorkspaceForUser(prisma, { id: user.id, email: user.email });
    memberships = await listWorkspacesForUser(prisma, user.id);
  }

  if (memberships.length === 1) redirect(`/w/${memberships[0].workspace.slug}`);

  return (
    <AppFrame>
      <PageMain width="narrow">
        <PageHeader title="Your workspaces" lead="Pick one to open." />
        {memberships.length === 0 ? (
          <p className="text-sm text-foreground/75">
            This account has no workspace and no email address to name one after. Sign in with an
            account that has an address, or ask an owner to add you to theirs.
          </p>
        ) : (
          <ul className="grid gap-3 sm:grid-cols-2">
            {memberships.map((entry) => (
              <li key={entry.workspace.slug}>
                <Link
                  href={`/w/${entry.workspace.slug}`}
                  className="glass glass--card ui-focus flex items-center justify-between gap-3 rounded-xl px-4 py-4 transition-colors hover:border-foreground/25"
                >
                  <span className="min-w-0">
                    <span className="block truncate font-semibold">{entry.workspace.name}</span>
                    <span className="font-terminal tabular-nums block truncate text-xs text-muted">
                      /w/{entry.workspace.slug}
                    </span>
                  </span>
                  <span className="font-terminal tabular-nums text-[0.75rem] text-muted uppercase">
                    {entry.role.toLowerCase()}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </PageMain>
    </AppFrame>
  );
}
