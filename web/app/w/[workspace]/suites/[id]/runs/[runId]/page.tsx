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
import { ShareDialog } from "@/components/app/share/share-dialog";
import { SuiteProgress } from "@/components/app/suite/progress";
import { SuiteReport } from "@/components/app/suite-report";
import { Timestamp } from "@/components/shell/timestamp";
import { buttonClass } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/surface";
import { authorize } from "@/lib/authorize";
import { prisma } from "@/lib/db";
import { listSharesForTarget } from "@/lib/repositories/shares";
import { findSuiteRun, listSuiteRunRows } from "@/lib/repositories/suites";
import { toShareRows } from "@/lib/share-rows";
import { readGrid } from "@/lib/suites/grid";
import { summarizeSuite } from "@/lib/suites/results";
import { requireWorkspace } from "@/lib/workspace";

export const metadata: Metadata = {
  title: "Suite results",
  description: "Cost reduction and verification outcomes per method, across a suite of programs.",
};

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

  const [rows, shares] = await Promise.all([
    listSuiteRunRows(prisma, runId),
    listSharesForTarget(prisma, { suiteRunId: runId }),
  ]);
  const grid = readGrid(suiteRun.grid);
  const results = summarizeSuite(rows, grid.methods);

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
          <>
            <ShareDialog
              slug={slug}
              target={{ suiteRunId: runId }}
              links={toShareRows(shares)}
              mayCreate={authorize(principal, "share:create")}
              mayRevoke={authorize(principal, "share:revoke")}
              what="these results"
            />
            <a href={`/api/suite-runs/${runId}/csv`} className={buttonClass({ variant: "secondary" })} download>
              Export CSV
            </a>
          </>
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

      <SuiteReport results={results} slug={slug} />
    </PageMain>
  );
}
