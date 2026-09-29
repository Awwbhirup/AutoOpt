/**
 * What one run of a suite found. Headline numbers first, then the spread of
 * cost reduction per method, what verification said, and the program by
 * method table with a link to every trace. Server-rendered from the run rows;
 * the progress bar above refreshes it while the suite is still going.
 */

import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { PageMain } from "@/components/app/frame";
import { ReductionDistribution } from "@/components/app/suite/distribution";
import { ProgramMatrix } from "@/components/app/suite/matrix";
import { SuiteProgress } from "@/components/app/suite/progress";
import { VerificationOutcomes } from "@/components/app/suite/verification";
import { Timestamp } from "@/components/shell/timestamp";
import { buttonClass } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader, Panel, Stat } from "@/components/ui/surface";
import { authorize } from "@/lib/authorize";
import { prisma } from "@/lib/db";
import { findSuiteRun, listSuiteRunRows } from "@/lib/repositories/suites";
import { readGrid } from "@/lib/suites/grid";
import { summarizeSuite } from "@/lib/suites/results";
import { requireWorkspace } from "@/lib/workspace";

export const metadata: Metadata = {
  title: "Suite results",
  description: "Cost reduction and verification outcomes per method, across a suite of programs.",
};

const pct = (value: number | null) => (value === null ? "n/a" : `${value.toFixed(1)}%`);

export default async function SuiteRunPage({
  params,
}: {
  params: Promise<{ workspace: string; id: string; runId: string }>;
}) {
  const { workspace: slug, id, runId } = await params;
  const { workspace, principal } = await requireWorkspace(slug);
  if (!authorize(principal, "run:view")) notFound();

  const suiteRun = await findSuiteRun(prisma, runId);
  if (suiteRun === null || suiteRun.suite.workspaceId !== workspace.id || suiteRun.suite.id !== id) {
    notFound();
  }

  const rows = await listSuiteRunRows(prisma, runId);
  const grid = readGrid(suiteRun.grid);
  const results = summarizeSuite(rows, grid.methods);

  const counted = results.methods.reduce((sum, method) => sum + method.pass + method.fail, 0);
  const matched = results.methods.reduce((sum, method) => sum + method.pass, 0);
  const best = [...results.methods].reverse().find((method) => method.spread.median !== null && !method.baseline);
  const running = rows.filter((row) => row.status === "RUNNING").length;

  return (
    <PageMain>
      <PageHeader
        eyebrow={
          <>
            <Link href={`/w/${slug}/suites`} className="ui-focus underline-offset-4 hover:underline">
              suites
            </Link>{" "}
            /{" "}
            <Link href={`/w/${slug}/suites/${id}`} className="ui-focus underline-offset-4 hover:underline">
              {suiteRun.suite.name}
            </Link>{" "}
            / results
          </>
        }
        title={suiteRun.suite.name}
        actions={
          <a href={`/api/suite-runs/${runId}/csv`} className={buttonClass({ variant: "secondary" })} download>
            Export CSV
          </a>
        }
      >
        <p className="mt-2 text-sm text-foreground/75">
          Started by {suiteRun.startedBy?.name ?? suiteRun.startedBy?.email ?? "someone since removed"},{" "}
          <Timestamp at={suiteRun.startedAt} />
        </p>
      </PageHeader>

      <div className="glass glass--card mb-6 rounded-xl px-4 py-4">
        <SuiteProgress
          suiteRunId={runId}
          slug={slug}
          mayCancel={authorize(principal, "suite:run")}
          initial={{
            status: suiteRun.status,
            total: suiteRun.total,
            completed: results.finished,
            running,
            succeeded: rows.filter((row) => row.status === "SUCCEEDED").length,
            failed: rows.filter((row) => row.status === "FAILED" || row.status === "ABANDONED").length,
          }}
        />
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat
          label="Mean reduction"
          value={pct(results.overallMean)}
          note="every finished run, controls included"
          accent="var(--ramp-2)"
        />
        <Stat
          label="Search methods"
          value={pct(results.searchMean)}
          note="controls left out"
          accent="var(--ramp-3)"
        />
        <Stat
          label="Best method"
          value={best ? best.label : "n/a"}
          note={best ? `median ${pct(best.spread.median)}` : "no finished runs yet"}
          accent="var(--ramp-4)"
        />
        <Stat
          label="Output matched"
          value={counted === 0 ? "n/a" : `${matched}/${counted}`}
          note="runs whose output was checked"
          accent="var(--accent)"
        />
      </div>

      {rows.length === 0 ? (
        <Panel className="mt-6">
          <EmptyState title="This suite run has no runs">
            Its programs may have been deleted after it was started.
          </EmptyState>
        </Panel>
      ) : (
        <div className="mt-6 grid grid-cols-1 items-start gap-6 xl:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
          <Panel title="Cost reduction by method" bodyClassName="px-4 py-4">
            <ReductionDistribution methods={results.methods} />
          </Panel>
          <Panel title="Verification outcomes" bodyClassName="px-4 py-4">
            <VerificationOutcomes methods={results.methods} />
          </Panel>
          <Panel
            title="By program"
            aside={`${results.programs.length} programs`}
            className="xl:col-span-2"
          >
            <ProgramMatrix programs={results.programs} methods={results.methods} slug={slug} />
          </Panel>
        </div>
      )}
    </PageMain>
  );
}
