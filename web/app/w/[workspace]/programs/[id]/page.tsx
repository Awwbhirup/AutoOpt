/**
 * One program: the source as it was stored, every run made of it, and the
 * control that adds another.
 *
 * The source itself is read only. It is what the runs below were made from, so
 * a box that let it be edited in place would quietly detach a program's history
 * from the program it is a history of.
 */

import type { Prisma } from "@prisma/client";
import Link from "next/link";
import { notFound } from "next/navigation";

import { PageMain } from "@/components/app/frame";
import { RunProgram } from "@/components/shell/run-program";
import { RunTable } from "@/components/shell/run-table";
import { Timestamp } from "@/components/shell/timestamp";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader, Panel } from "@/components/ui/surface";
import { authorize } from "@/lib/authorize";
import { categoryLabel } from "@/lib/categories";
import { prisma } from "@/lib/db";
import { findProgram } from "@/lib/repositories/programs";
import { listRunsForProgram } from "@/lib/repositories/runs";
import { requireWorkspace } from "@/lib/workspace";

/**
 * The engine's instruction counts, when a run has reported any.
 *
 * Guarded rather than trusted: the column is Json, so what is in it is whatever
 * the engine sent, and a page is not the place to find out it was a list.
 */
function Features({ features }: { features: Prisma.JsonValue }) {
  if (features === null || typeof features !== "object" || Array.isArray(features)) {
    return null;
  }

  const entries = Object.entries(features).filter(
    ([, value]) => typeof value === "number" || typeof value === "string",
  );
  if (entries.length === 0) return null;

  return (
    <dl className="flex flex-wrap gap-x-4 gap-y-1 border-t border-line px-4 py-3 text-xs">
      {entries.map(([name, value]) => (
        <div key={name} className="flex gap-1.5">
          <dt className="text-muted">{name.replace(/_/g, " ")}</dt>
          <dd className="font-terminal tabular-nums text-foreground">
            {String(value)}
          </dd>
        </div>
      ))}
    </dl>
  );
}

function SourceListing({ source }: { source: string }) {
  const lines = source.replace(/\n+$/, "").split("\n");

  return (
    <pre
      data-lenis-prevent
      className="font-terminal tabular-nums overflow-x-auto overscroll-x-contain px-4 py-3 text-xs leading-5"
    >
      <code>
        {lines.map((line, index) => (
          <span key={index} className="grid grid-cols-[2.5rem_1fr]">
            <span className="pr-3 text-right text-muted opacity-70 select-none">
              {index + 1}
            </span>
            {/* A blank line still needs a row, and an empty span has no height. */}
            <span>{line === "" ? " " : line}</span>
          </span>
        ))}
      </code>
    </pre>
  );
}

export default async function ProgramPage({
  params,
}: {
  params: Promise<{ workspace: string; id: string }>;
}) {
  const { workspace: slug, id } = await params;
  const { workspace, principal } = await requireWorkspace(slug);

  const program = await findProgram(prisma, id);
  // A program id from another workspace is refused the way a made-up one is.
  // Being a member here says nothing about a program kept somewhere else.
  if (program === null || program.project.workspaceId !== workspace.id) notFound();

  const runs = await listRunsForProgram(prisma, program.id);
  // The same question the route handler asks before it creates the row. A
  // VIEWER seeing a Run button would be told no by the API, which is a worse
  // way to learn it than not being offered it.
  const mayRun = authorize(principal, "run:start");

  return (
    <PageMain>
      <PageHeader
        eyebrow={
          <>
            <Link href={`/w/${slug}/projects`} className="ui-focus underline-offset-4 hover:underline">
              projects
            </Link>{" "}
            / {program.project.name}
          </>
        }
        title={program.name}
      >
        <p className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-foreground/75">
          <Badge tone="info">{categoryLabel(program.category)}</Badge>
          <span>added by {program.author?.name ?? "someone since removed"}</span>
          <Timestamp at={program.createdAt} />
          {program.uploadName === null ? null : (
            <span className="font-terminal tabular-nums text-xs">{program.uploadName}</span>
          )}
        </p>
      </PageHeader>

      <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-[minmax(0,26rem)_minmax(0,1fr)]">
        <Panel title="Source" aside={`${program.source.length} characters`}>
          <SourceListing source={program.source} />
          <Features features={program.features} />
        </Panel>

        <div className="flex min-w-0 flex-col gap-6">
          {mayRun ? (
            <Panel title="Optimize">
              <div className="px-4 py-4">
                <RunProgram programId={program.id} />
              </div>
            </Panel>
          ) : null}

          <Panel title="Runs" aside={runs.length === 0 ? undefined : `${runs.length} shown`}>
            {runs.length === 0 ? (
              <EmptyState compact title="No runs yet">
                {mayRun
                  ? "Pick a method above to make the first one."
                  : "This program has not been run yet."}
              </EmptyState>
            ) : (
              <RunTable runs={runs} slug={slug} showProgram={false} />
            )}
          </Panel>
        </div>
      </div>
    </PageMain>
  );
}
