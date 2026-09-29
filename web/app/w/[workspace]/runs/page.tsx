/**
 * The most recent runs in a workspace, newest first. Capped by the repository,
 * with no paging behind it yet, so a busy workspace has older runs that only a
 * program's own history reaches.
 *
 * Reads the stored rows and nothing else. A run that finished last week and a
 * run that is going on right now are the same query, because the trace was
 * written down as it happened rather than held by whoever started it.
 */

import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { PageMain } from "@/components/app/frame";
import { RunTable } from "@/components/shell/run-table";
import { ButtonLink } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader, Panel } from "@/components/ui/surface";
import { authorize } from "@/lib/authorize";
import { prisma } from "@/lib/db";
import { listRecentRuns } from "@/lib/repositories/runs";
import { requireWorkspace } from "@/lib/workspace";

export const metadata: Metadata = {
  title: "Runs",
  description: "Every optimization run in this workspace, and what it decided.",
};

export default async function RunsPage({
  params,
}: {
  params: Promise<{ workspace: string }>;
}) {
  const { workspace: slug } = await params;
  const { workspace, principal } = await requireWorkspace(slug);
  // Not a 403: someone with no standing in this workspace should not learn
  // from the response that it exists.
  if (!authorize(principal, "run:view")) notFound();

  const runs = await listRecentRuns(prisma, workspace.id);

  return (
    <PageMain>
      <PageHeader
        eyebrow={workspace.name}
        title="Runs"
        lead="Every run keeps its decision log, so a trace can be read long after the page that watched it was closed."
      />

      <Panel title="Recent runs" aside={runs.length === 0 ? undefined : `${runs.length} shown`}>
        {runs.length === 0 ? (
          <EmptyState
            title="No runs here yet"
            action={
              <ButtonLink href={`/w/${slug}/projects`} variant="primary" size="sm">
                Go to projects
              </ButtonLink>
            }
          >
            Runs start from a program&apos;s page. Pick a method and the trace streams in as the
            engine works.
          </EmptyState>
        ) : (
          <RunTable runs={runs} slug={slug} />
        )}
      </Panel>
    </PageMain>
  );
}
