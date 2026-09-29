/**
 * A shared run or suite result, read-only, for anyone with the link. It shows
 * what the workspace page shows for the same thing and nothing around it: no
 * workspace name, no other runs, no links back into the app.
 */

import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { PageMain } from "@/components/app/frame";
import { RunReport } from "@/components/app/run-report";
import { SuiteReport } from "@/components/app/suite-report";
import { RunStatusBadge } from "@/components/shell/run-table";
import { formatWhen } from "@/components/shell/timestamp";
import { ButtonLink } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader, Panel } from "@/components/ui/surface";
import { categoryLabel } from "@/lib/categories";
import { prisma } from "@/lib/db";
import { methodLabel } from "@/lib/methods";
import { countView } from "@/lib/repositories/shares";
import { loadSharedView } from "@/lib/shared-view";
import { percentReduction } from "@/lib/trace";

type Params = { params: Promise<{ token: string }> };

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { token } = await params;
  const view = await loadSharedView(token);
  const robots = { index: false, follow: false };
  if (view === null || view.kind === "gone") return { title: "Shared link", robots };

  if (view.kind === "run") {
    const { run } = view;
    const reduction =
      run.costBefore === null || run.costAfter === null ? null : percentReduction(run.costBefore, run.costAfter);
    return {
      title: `${run.program.name}, ${methodLabel(run.method)}`,
      description:
        reduction === null
          ? `An AutoOpt run of ${run.program.name}, with every decision the optimizer made.`
          : `${methodLabel(run.method)} cut the cost of ${run.program.name} by ${reduction.toFixed(1)}%${run.outputMatch ? ", output verified" : ""}. Every decision is in the trace.`,
      robots,
    };
  }
  const { results, suiteRun } = view;
  return {
    title: `${suiteRun.suite.name}: suite results`,
    description: `${results.programs.length} programs, ${results.methods.length} methods, mean cost reduction ${
      results.overallMean === null ? "n/a" : `${results.overallMean.toFixed(1)}%`
    }.`,
    robots,
  };
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <dt className="text-[0.78rem] tracking-wider text-muted uppercase">{label}</dt>
      <dd className="mt-0.5 truncate font-terminal text-sm tabular-nums">{value}</dd>
    </div>
  );
}

function elapsed(startedAt: Date, finishedAt: Date | null): string {
  if (finishedAt === null) return "n/a";
  return `${((finishedAt.getTime() - startedAt.getTime()) / 1000).toFixed(1)} s`;
}

export default async function SharedPage({ params }: Params) {
  const { token } = await params;
  const view = await loadSharedView(token);
  if (view === null) notFound();

  if (view.kind === "gone") {
    return (
      <PageMain width="narrow">
        <Panel>
          <EmptyState
            title={view.reason === "revoked" ? "This link was revoked" : "This link has expired"}
            action={
              <ButtonLink href="/try" variant="primary">
                Try the optimizer
              </ButtonLink>
            }
          >
            Whoever shared it has stopped sharing what it pointed to. Ask them for a new link.
          </EmptyState>
        </Panel>
      </PageMain>
    );
  }

  await countView(prisma, view.shareId);

  if (view.kind === "run") {
    const { run } = view;
    return (
      <PageMain>
        <PageHeader
          eyebrow="shared run"
          title={run.program.name}
          actions={<RunStatusBadge status={run.status} />}
        >
          <dl className="mt-5 grid grid-cols-2 gap-x-6 gap-y-3 sm:grid-cols-3 lg:grid-cols-5">
            <Fact label="method" value={methodLabel(run.method)} />
            <Fact label="category" value={categoryLabel(run.program.category)} />
            <Fact label="proof" value={run.finalProof ?? "none"} />
            <Fact label="started" value={formatWhen(run.startedAt)} />
            <Fact label="took" value={elapsed(run.startedAt, run.finishedAt)} />
          </dl>
        </PageHeader>
        <details className="glass glass--card mb-4 rounded-xl">
          <summary className="cursor-pointer px-4 py-3 text-sm font-semibold">Program source</summary>
          <pre className="overflow-x-auto overscroll-x-contain border-t border-line px-4 py-3 font-terminal text-xs leading-5" data-lenis-prevent>
            {run.program.source}
          </pre>
        </details>
        <RunReport run={run} />
      </PageMain>
    );
  }

  const { suiteRun, results } = view;
  return (
    <PageMain>
      <PageHeader
        eyebrow="shared suite results"
        title={suiteRun.suite.name}
        lead={suiteRun.suite.description ?? undefined}
      >
        <p className="mt-2 text-sm text-foreground/75">
          {results.finished} of {suiteRun.total} runs finished, started {formatWhen(suiteRun.startedAt)}.
        </p>
      </PageHeader>
      <SuiteReport results={results} />
    </PageMain>
  );
}
