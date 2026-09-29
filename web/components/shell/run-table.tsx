/**
 * A list of runs, dense enough to skim.
 *
 * The dashboard, the runs page and a program's history show the same columns
 * bar one, so they show them from the same component: two tables of runs that
 * disagreed about what a cost column means would be worse than one table with
 * a flag on it.
 */

import type { RunStatus } from "@prisma/client";
import Link from "next/link";

import { Reduction } from "@/components/app/reduction";
import { Badge, type Tone } from "@/components/ui/badge";
import { DataTable, type Column } from "@/components/ui/data-table";
import type { RunSummary } from "@/lib/repositories/runs";
import { percentReduction } from "@/lib/trace";

import { Timestamp } from "./timestamp";

const STATUS_TONE: Record<RunStatus, { tone: Tone; mark: string }> = {
  QUEUED: { tone: "neutral", mark: "." },
  RUNNING: { tone: "info", mark: ">" },
  SUCCEEDED: { tone: "kept", mark: "+" },
  FAILED: { tone: "refused", mark: "x" },
  // Not a failure of the engine's: the client that started it went away.
  ABANDONED: { tone: "caution", mark: "-" },
};

export function RunStatusBadge({ status }: { status: RunStatus }) {
  const { tone, mark } = STATUS_TONE[status];
  return (
    <Badge tone={tone} mark={mark}>
      {status.toLowerCase()}
    </Badge>
  );
}

function reductionOf(run: RunSummary): number | null {
  if (run.costBefore === null || run.costAfter === null) return null;
  return percentReduction(run.costBefore, run.costAfter);
}

function OutputCheck({ match }: { match: boolean | null }) {
  // Distinct from FAIL on purpose: a run that was never checked has not passed.
  if (match === null) {
    return <span className="text-xs text-muted">not checked</span>;
  }
  return match ? (
    <Badge tone="kept" mark="+">
      PASS
    </Badge>
  ) : (
    <Badge tone="refused" mark="x">
      FAIL
    </Badge>
  );
}

export function RunTable({
  runs,
  slug,
  showProgram = true,
}: {
  runs: RunSummary[];
  slug: string;
  /** Off where the page is already about one program. */
  showProgram?: boolean;
}) {
  const columns: Column<RunSummary>[] = [
    ...(showProgram
      ? [
          {
            key: "program",
            header: "Program",
            cell: (run: RunSummary) => (
              <div className="min-w-0">
                <Link
                  href={`/w/${slug}/runs/${run.id}`}
                  className="ui-focus font-medium underline-offset-4 hover:underline"
                >
                  {run.program.name}
                </Link>
                <span className="block truncate text-xs text-muted">
                  {run.program.project.name}
                  {run.startedBy?.name ? ` / ${run.startedBy.name}` : ""}
                </span>
              </div>
            ),
          },
        ]
      : []),
    {
      key: "status",
      header: "Status",
      cell: (run) => <RunStatusBadge status={run.status} />,
    },
    {
      key: "method",
      header: "Method",
      mono: true,
      cell: (run) => (
        <>
          {run.method}
          <span className="text-muted"> /{run.seed}</span>
        </>
      ),
    },
    {
      key: "cost",
      header: "Cost",
      align: "right",
      mono: true,
      wide: true,
      cell: (run) =>
        run.costBefore === null || run.costAfter === null
          ? "n/a"
          : `${run.costBefore.toFixed(1)} -> ${run.costAfter.toFixed(1)}`,
    },
    {
      key: "reduction",
      header: "Reduction",
      align: "right",
      cell: (run) => <Reduction percent={reductionOf(run)} />,
    },
    {
      key: "output",
      header: "Output",
      wide: true,
      cell: (run) => <OutputCheck match={run.outputMatch} />,
    },
    {
      key: "started",
      header: "Started",
      wide: true,
      className: "text-xs",
      cell: (run) => <Timestamp at={run.startedAt} />,
    },
    {
      key: "trace",
      header: <span className="sr-only">Trace</span>,
      align: "right",
      cell: (run) => (
        <Link
          href={`/w/${slug}/runs/${run.id}`}
          className="ui-focus font-terminal tabular-nums text-xs text-muted underline-offset-4 hover:text-foreground hover:underline"
        >
          trace
        </Link>
      ),
    },
  ];

  return <DataTable columns={columns} rows={runs} rowKey={(run) => run.id} caption="Runs" />;
}
