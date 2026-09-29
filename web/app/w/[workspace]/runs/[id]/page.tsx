/**
 * One stored run, rendered from its decision log.
 *
 * Nothing here calls the engine. The trace is replayed out of the rows written
 * while the run was going, folded by the same function the live page uses, so
 * the trace a reader sees a week later is the trace that was watched.
 */

import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { PageMain } from "@/components/app/frame";
import { RunStatusBadge } from "@/components/shell/run-table";
import { formatWhen } from "@/components/shell/timestamp";
import { RunReport } from "@/components/app/run-report";
import { ShareDialog } from "@/components/app/share/share-dialog";
import { ButtonLink } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/surface";
import { authorize } from "@/lib/authorize";
import { prisma } from "@/lib/db";
import { findRunWithEvents } from "@/lib/repositories/runs";
import { listSharesForTarget } from "@/lib/repositories/shares";
import { toShareRows } from "@/lib/share-rows";
import { requireWorkspace } from "@/lib/workspace";

export const metadata: Metadata = {
  title: "Run",
  description: "Every decision one optimization run made, as it was recorded.",
};

function elapsed(startedAt: Date, finishedAt: Date | null): string {
  if (finishedAt === null) return "n/a";
  return `${((finishedAt.getTime() - startedAt.getTime()) / 1000).toFixed(1)} s`;
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <dt className="text-[0.78rem] tracking-wider text-muted uppercase">{label}</dt>
      <dd className="font-terminal tabular-nums mt-0.5 truncate text-sm">{value}</dd>
    </div>
  );
}

export default async function RunDetailPage({
  params,
}: {
  params: Promise<{ workspace: string; id: string }>;
}) {
  const { workspace: slug, id } = await params;
  const { workspace, principal } = await requireWorkspace(slug);
  if (!authorize(principal, "trace:view")) notFound();

  const run = await findRunWithEvents(prisma, id);
  // The run has to be in the workspace the URL named. Without this a member of
  // any workspace could read any run by pointing their own slug at its id.
  if (run === null || run.program.project.workspaceId !== workspace.id) notFound();

  const shares = await listSharesForTarget(prisma, { runId: run.id });

  return (
    <PageMain>
      <PageHeader
        eyebrow={
          <>
            <Link href={`/w/${slug}/runs`} className="ui-focus underline-offset-4 hover:underline">
              runs
            </Link>{" "}
            / {run.program.project.name} / {run.id}
          </>
        }
        title={run.program.name}
        actions={
          <>
            <RunStatusBadge status={run.status} />
            <ButtonLink href={`/w/${slug}/runs/compare?a=${run.id}`} variant="secondary">
              Compare
            </ButtonLink>
            <ShareDialog
              slug={slug}
              target={{ runId: run.id }}
              links={toShareRows(shares)}
              mayCreate={authorize(principal, "share:create")}
              mayRevoke={authorize(principal, "share:revoke")}
              what="this run"
            />
          </>
        }
      >
        <dl className="mt-5 grid grid-cols-2 gap-x-6 gap-y-3 sm:grid-cols-3 lg:grid-cols-5">
          <Fact label="method" value={run.method} />
          <Fact label="seed" value={String(run.seed)} />
          <Fact label="proof" value={run.finalProof ?? "none"} />
          <Fact label="started" value={formatWhen(run.startedAt)} />
          <Fact label="took" value={elapsed(run.startedAt, run.finishedAt)} />
        </dl>
      </PageHeader>

      <RunReport run={run} />
    </PageMain>
  );
}
