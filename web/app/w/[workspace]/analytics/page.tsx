/**
 * The workspace in numbers. Headline figures first, then runs over time and
 * the spread of cost reduction per method; categories, transformations,
 * verification and the slowest programs are one tab away.
 *
 * Every figure is computed from this workspace's stored runs and rewrites by
 * lib/analytics.ts. Cost reduction is shown both ways the owner asked for:
 * over every run with the controls in, and over the search methods only.
 */

import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { CategoryMatrix } from "@/components/app/analytics/category-matrix";
import { CountedList } from "@/components/app/analytics/counted-list";
import { RunsOverTime } from "@/components/app/analytics/runs-over-time";
import { TransformationBars } from "@/components/app/analytics/transformations";
import { PageMain } from "@/components/app/frame";
import { ReductionDistribution } from "@/components/app/suite/distribution";
import { VerificationOutcomes } from "@/components/app/suite/verification";
import { ButtonLink } from "@/components/ui/button";
import { DataTable, type Column } from "@/components/ui/data-table";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader, Panel, Stat } from "@/components/ui/surface";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  byCategory,
  headline,
  RANGES,
  readRange,
  runsPerDay,
  slowestPrograms,
  transformationStats,
  type ProgramTiming,
} from "@/lib/analytics";
import { authorize } from "@/lib/authorize";
import { categoryLabel } from "@/lib/categories";
import { cx } from "@/lib/cx";
import { prisma } from "@/lib/db";
import {
  ANALYTICS_RUN_LIMIT,
  listAnalyticsRuns,
  rejectReasons,
  transformationGroups,
  verifierVerdicts,
} from "@/lib/repositories/analytics";
import { summarizeSuite } from "@/lib/suites/results";
import { rejectLabel, verdictLabel, type RejectReason, type VerificationVerdict } from "@/lib/trace";
import { requireWorkspace } from "@/lib/workspace";

export const metadata: Metadata = {
  title: "Analytics",
  description: "Runs, cost reduction, verification and transformations across a workspace.",
};

const pct = (value: number | null) => (value === null ? "n/a" : `${value.toFixed(1)}%`);

export default async function AnalyticsPage({
  params,
  searchParams,
}: {
  params: Promise<{ workspace: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { workspace: slug } = await params;
  const range = readRange((await searchParams).range);
  const { workspace, principal } = await requireWorkspace(slug);
  if (!authorize(principal, "analytics:view")) notFound();

  const now = new Date();
  const days = RANGES[range].days;
  const since = days === null ? null : new Date(now.getTime() - days * 86_400_000);

  const [runs, groups, reasons, verdicts] = await Promise.all([
    listAnalyticsRuns(prisma, workspace.id, since),
    transformationGroups(prisma, workspace.id, since),
    rejectReasons(prisma, workspace.id, since),
    verifierVerdicts(prisma, workspace.id, since),
  ]);

  const top = headline(runs);
  const methods = summarizeSuite(runs).methods;
  const categories = byCategory(runs, methods.map((method) => method.method));
  const transformations = transformationStats(groups);
  const slowest = slowestPrograms(runs);
  const accepted = transformations.reduce((sum, stat) => sum + stat.accepted, 0);
  const proposed = transformations.reduce((sum, stat) => sum + stat.proposed, 0);

  const filter = (
    <nav aria-label="Time range" className="flex rounded-lg border border-line bg-surface p-0.5">
      {(Object.keys(RANGES) as (keyof typeof RANGES)[]).map((key) => (
        <Link
          key={key}
          href={`/w/${slug}/analytics${key === "30d" ? "" : `?range=${key}`}`}
          aria-current={key === range ? "page" : undefined}
          className={cx(
            "ui-focus rounded-md px-2.5 py-1 text-xs font-medium transition-colors",
            key === range ? "bg-foreground/10 text-foreground" : "text-muted hover:text-foreground",
          )}
        >
          {RANGES[key].label}
        </Link>
      ))}
    </nav>
  );

  const slowColumns: Column<ProgramTiming>[] = [
    {
      key: "name",
      header: "Program",
      cell: (row) => (
        <Link href={`/w/${slug}/programs/${row.programId}`} className="ui-focus font-medium underline-offset-4 hover:underline">
          {row.name}
        </Link>
      ),
    },
    { key: "category", header: "Category", wide: true, cell: (row) => <span className="text-foreground/75">{categoryLabel(row.category)}</span> },
    { key: "runs", header: "Runs", align: "right", mono: true, cell: (row) => row.runs },
    { key: "mean", header: "Mean", align: "right", mono: true, cell: (row) => `${(row.seconds.mean ?? 0).toFixed(1)} s` },
    { key: "max", header: "Slowest", align: "right", mono: true, wide: true, cell: (row) => `${(row.seconds.max ?? 0).toFixed(1)} s` },
  ];

  return (
    <PageMain>
      <PageHeader
        eyebrow={workspace.name}
        title="Analytics"
        lead={`Every run in this workspace over ${RANGES[range].label.toLowerCase()}: what it cost, what verified, and which rewrites earned their place.`}
        actions={filter}
      />

      {runs.length === 0 ? (
        <Panel>
          <EmptyState
            title="No runs in this range"
            action={
              <ButtonLink href={`/w/${slug}/suites`} variant="primary" size="sm">
                Run a suite
              </ButtonLink>
            }
          >
            Charts fill in from real runs. A benchmark suite is the quickest way to get a spread of
            methods over several programs.
          </EmptyState>
        </Panel>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Stat label="Mean reduction" value={pct(top.overallMean)} note="all methods, controls included" accent="var(--ramp-2)" />
            <Stat label="Search methods" value={pct(top.searchMean)} note="controls left out" accent="var(--ramp-3)" />
            <Stat
              label="Runs"
              value={top.runs}
              note={top.succeededShare === null ? "none finished" : `${(top.succeededShare * 100).toFixed(0)}% succeeded`}
              accent="var(--ramp-1)"
            />
            <Stat
              label="Output matched"
              value={top.checked === 0 ? "n/a" : `${((top.matched / top.checked) * 100).toFixed(1)}%`}
              note={`${top.matched} of ${top.checked} checked runs`}
              accent="var(--accent)"
            />
          </div>
          {runs.length >= ANALYTICS_RUN_LIMIT ? (
            <p className="mt-3 text-xs text-muted">Showing the most recent {ANALYTICS_RUN_LIMIT} runs in this range.</p>
          ) : null}

          <div className="mt-6 grid grid-cols-1 items-start gap-6 xl:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
            <Panel title="Runs per day" bodyClassName="px-4 py-4">
              <RunsOverTime days={runsPerDay(runs, days, now)} />
            </Panel>
            <Panel title="Cost reduction by method" bodyClassName="px-4 py-4">
              <ReductionDistribution methods={methods} />
            </Panel>
          </div>

          <Panel className="mt-6" bodyClassName="px-4 pb-4">
            <Tabs defaultValue="categories">
              <TabsList className="-mx-4 px-4 pt-1">
                <TabsTrigger value="categories">By category</TabsTrigger>
                <TabsTrigger value="transformations">Transformations</TabsTrigger>
                <TabsTrigger value="verification">Verification</TabsTrigger>
                <TabsTrigger value="programs">Slowest programs</TabsTrigger>
              </TabsList>

              <TabsContent value="categories" className="-mx-4">
                <CategoryMatrix rows={categories} methods={methods} />
              </TabsContent>

              <TabsContent value="transformations">
                <p className="mb-4 text-sm text-foreground/75">
                  {accepted} of {proposed} priced rewrites were kept (
                  {proposed === 0 ? "n/a" : `${((accepted / proposed) * 100).toFixed(1)}%`}). Cost change is the mean
                  weighted-cost difference of the kept ones; negative is cheaper.
                </p>
                <div className="grid grid-cols-1 gap-8 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
                  {transformations.length === 0 ? (
                    <p className="text-sm text-muted">No rewrites were priced in this range.</p>
                  ) : (
                    <TransformationBars stats={transformations} />
                  )}
                  <div>
                    <h3 className="mb-3 text-sm font-semibold">Why rewrites were turned down</h3>
                    <CountedList
                      items={reasons}
                      tone="bg-refused/70"
                      label={(value) => rejectLabel(value as RejectReason) ?? value.replace(/_/g, " ")}
                    />
                  </div>
                </div>
              </TabsContent>

              <TabsContent value="verification">
                <div className="grid grid-cols-1 gap-8 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
                  <VerificationOutcomes methods={methods} />
                  <div>
                    <h3 className="mb-3 text-sm font-semibold">Verifier verdicts on each rewrite</h3>
                    <CountedList
                      items={verdicts}
                      tone="bg-accent/70"
                      label={(value) => verdictLabel(value as VerificationVerdict) ?? value.replace(/_/g, " ")}
                    />
                    <p className="mt-3 text-xs leading-relaxed text-muted">
                      Output match is checked once per run on the final program. Verdicts here are per
                      proposed rewrite, before it was kept or turned down.
                    </p>
                  </div>
                </div>
              </TabsContent>

              <TabsContent value="programs" className="-mx-4">
                {slowest.length === 0 ? (
                  <EmptyState compact title="No finished runs yet" />
                ) : (
                  <DataTable columns={slowColumns} rows={slowest} rowKey={(row) => row.programId} caption="Slowest programs" />
                )}
                <p className="px-4 pt-3 text-xs text-muted">
                  Wall-clock time from start to finish, including verification. Runs still going are
                  left out.
                </p>
              </TabsContent>
            </Tabs>
          </Panel>
        </>
      )}
    </PageMain>
  );
}
