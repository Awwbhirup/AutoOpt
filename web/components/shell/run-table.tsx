/**
 * A list of runs, dense enough to skim.
 *
 * The dashboard and a program's history show the same columns bar one, so they
 * show them from the same component: two tables of runs that disagreed about
 * what a cost column means would be worse than one table with a flag on it.
 */

import type { RunStatus } from "@prisma/client";
import Link from "next/link";

import type { RunSummary } from "@/lib/repositories/runs";
import { percentReduction } from "@/lib/trace";

import { Timestamp } from "./timestamp";

const STATUS_STYLE: Record<RunStatus, string> = {
  QUEUED:
    "border-zinc-300 bg-zinc-100 text-zinc-700 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-300",
  RUNNING:
    "border-sky-300 bg-sky-50 text-sky-800 dark:border-sky-900 dark:bg-sky-950 dark:text-sky-300",
  SUCCEEDED:
    "border-emerald-300 bg-emerald-50 text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950 dark:text-emerald-300",
  FAILED:
    "border-rose-300 bg-rose-50 text-rose-800 dark:border-rose-900 dark:bg-rose-950 dark:text-rose-300",
  // Not a failure of the engine's: the client that started it went away.
  ABANDONED:
    "border-amber-300 bg-amber-50 text-amber-900 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-300",
};

function StatusBadge({ status }: { status: RunStatus }) {
  return (
    <span
      className={`inline-flex items-center rounded border px-1.5 py-0.5 text-xs font-medium ${STATUS_STYLE[status]}`}
    >
      {status.toLowerCase()}
    </span>
  );
}

function reduction(run: RunSummary): string {
  if (run.costBefore === null || run.costAfter === null) return "n/a";
  const percent = percentReduction(run.costBefore, run.costAfter);
  return percent === null ? "n/a" : `${percent.toFixed(1)}%`;
}

function outputCheck(run: RunSummary): string {
  // Distinct from FAIL on purpose: a run that was never checked has not passed.
  if (run.outputMatch === null) return "not checked";
  return run.outputMatch ? "PASS" : "FAIL";
}

const TH = "px-3 py-2 font-medium";
const TD = "px-3 py-2";

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
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left text-sm">
        <thead className="border-b border-zinc-200 text-xs text-zinc-500 dark:border-zinc-800 dark:text-zinc-400">
          <tr>
            {showProgram ? (
              <th scope="col" className={TH}>
                Program
              </th>
            ) : null}
            <th scope="col" className={TH}>
              Status
            </th>
            <th scope="col" className={TH}>
              Method
            </th>
            <th scope="col" className={`${TH} text-right`}>
              Cost
            </th>
            <th scope="col" className={`${TH} text-right`}>
              Reduction
            </th>
            <th scope="col" className={TH}>
              Output
            </th>
            <th scope="col" className={TH}>
              Started
            </th>
            <th scope="col" className={TH}>
              <span className="sr-only">Trace</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {runs.map((run) => (
            <tr
              key={run.id}
              className="border-b border-zinc-100 last:border-b-0 dark:border-zinc-900"
            >
              {showProgram ? (
                <td className={TD}>
                  <Link
                    href={`/w/${slug}/programs/${run.program.id}`}
                    className="text-zinc-900 underline-offset-2 hover:underline dark:text-zinc-100"
                  >
                    {run.program.name}
                  </Link>
                  <span className="ml-1.5 text-xs text-zinc-500 dark:text-zinc-400">
                    {run.program.project.name}
                  </span>
                </td>
              ) : null}
              <td className={TD}>
                <StatusBadge status={run.status} />
              </td>
              <td className={`${TD} font-mono text-xs text-zinc-600 dark:text-zinc-400`}>
                {run.method}
                <span className="text-zinc-400 dark:text-zinc-600"> /{run.seed}</span>
              </td>
              <td className={`${TD} text-right font-mono text-xs tabular-nums`}>
                {run.costBefore === null || run.costAfter === null
                  ? "n/a"
                  : `${run.costBefore.toFixed(1)} -> ${run.costAfter.toFixed(1)}`}
              </td>
              <td className={`${TD} text-right tabular-nums`}>{reduction(run)}</td>
              <td className={`${TD} font-mono text-xs`}>{outputCheck(run)}</td>
              <td className={`${TD} text-xs`}>
                <Timestamp at={run.startedAt} />
              </td>
              <td className={`${TD} text-right`}>
                <Link
                  href={`/w/${slug}/runs/${run.id}`}
                  className="text-xs text-zinc-600 underline-offset-2 hover:underline dark:text-zinc-400"
                >
                  trace
                </Link>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
