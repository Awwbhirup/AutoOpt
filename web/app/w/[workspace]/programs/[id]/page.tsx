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

import { Empty, Panel } from "@/components/shell/panel";
import { RunProgram } from "@/components/shell/run-program";
import { RunTable } from "@/components/shell/run-table";
import { Timestamp } from "@/components/shell/timestamp";
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
    <dl className="flex flex-wrap gap-x-4 gap-y-1 px-3 py-2 text-xs">
      {entries.map(([name, value]) => (
        <div key={name} className="flex gap-1">
          <dt className="text-zinc-500 dark:text-zinc-400">{name.replace(/_/g, " ")}</dt>
          <dd className="font-mono tabular-nums text-zinc-900 dark:text-zinc-100">
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
    <pre className="overflow-x-auto px-3 py-2 font-mono text-xs leading-5 text-zinc-900 dark:text-zinc-100">
      <code>
        {lines.map((line, index) => (
          <span key={index} className="grid grid-cols-[2.5rem_1fr]">
            <span className="select-none pr-3 text-right text-zinc-400 tabular-nums dark:text-zinc-600">
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
    <main className="mx-auto w-full max-w-6xl px-6 py-8">
      <header className="mb-6">
        <p className="text-sm text-zinc-500 dark:text-zinc-400">
          <Link
            href={`/w/${slug}/projects`}
            className="underline-offset-2 hover:underline"
          >
            {program.project.name}
          </Link>
        </p>
        <h1 className="mt-1 text-xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
          {program.name}
        </h1>
        <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-zinc-600 dark:text-zinc-400">
          <span>{categoryLabel(program.category)}</span>
          <span>added by {program.author?.name ?? "someone since removed"}</span>
          <Timestamp at={program.createdAt} />
          {program.uploadName === null ? null : (
            <span className="font-mono text-xs">{program.uploadName}</span>
          )}
        </p>
      </header>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,28rem)_minmax(0,1fr)]">
        <Panel title="Source" aside={`${program.source.length} characters`}>
          <SourceListing source={program.source} />
          <Features features={program.features} />
        </Panel>

        <div className="flex flex-col gap-6">
          {mayRun ? (
            <Panel title="Optimize">
              <div className="px-3 py-3">
                <RunProgram programId={program.id} />
              </div>
            </Panel>
          ) : null}

          <Panel
            title="Runs"
            aside={runs.length === 0 ? undefined : `${runs.length} shown`}
          >
            {runs.length === 0 ? (
              <Empty>
                {mayRun
                  ? "No runs yet. Pick a method above to make one."
                  : "This program has not been run yet."}
              </Empty>
            ) : (
              <RunTable runs={runs} slug={slug} showProgram={false} />
            )}
          </Panel>
        </div>
      </div>
    </main>
  );
}
