/**
 * Two runs side by side: what each ended at, the rewrites each kept lined up
 * against the other's, counts per kind, and a diff of the two final listings.
 * Most useful for two methods on one program: it shows where the searches
 * parted and what that cost or saved.
 *
 * The pickers are a plain GET form, so changing a run is a link like any
 * other and the comparison can be bookmarked or pasted.
 */

import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { PageMain } from "@/components/app/frame";
import { DiffView } from "@/components/app/playground/diff-view";
import { RunStatusBadge } from "@/components/shell/run-table";
import { formatWhen } from "@/components/shell/timestamp";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Field, Select } from "@/components/ui/input";
import { Callout, PageHeader, Panel } from "@/components/ui/surface";
import { authorize } from "@/lib/authorize";
import { alignSteps, keptSteps, kindCounts, type KeptStep } from "@/lib/compare";
import { cx } from "@/lib/cx";
import { prisma } from "@/lib/db";
import { methodLabel } from "@/lib/methods";
import { findRunWithEvents, listRunsForProgram, type RunWithEvents } from "@/lib/repositories/runs";
import { replayEvents } from "@/lib/replay";
import { foldTrace, optimizationLabel, type Trace } from "@/lib/trace";
import { requireWorkspace } from "@/lib/workspace";

export const metadata: Metadata = { title: "Compare runs" };

const pct = (value: number | null) => (value === null ? "n/a" : `${value.toFixed(1)}%`);

function Side({ label, run, trace, slug }: { label: string; run: RunWithEvents; trace: Trace; slug: string }) {
  const { summary } = trace;
  const facts: [string, string][] = [
    ["cost", summary.costBefore && summary.costAfter ? `${summary.costBefore.weighted_total.toFixed(2)} -> ${summary.costAfter.weighted_total.toFixed(2)}` : "n/a"],
    ["reduction", pct(summary.reductionPercent)],
    ["kept / turned down", `${summary.accepted} / ${summary.rejected}`],
    ["iterations", summary.iterations === null ? "n/a" : String(summary.iterations)],
    ["output", summary.outputMatch === null ? "not checked" : summary.outputMatch ? "PASS" : "FAIL"],
    ["started", formatWhen(run.startedAt)],
  ];
  return (
    <Panel
      title={
        <span className="flex items-center gap-2">
          <span className="grid size-6 place-items-center rounded-md bg-foreground/10 font-terminal text-xs">{label}</span>
          {methodLabel(run.method)}
          <span className="font-terminal text-xs font-normal text-muted">seed {run.seed}</span>
        </span>
      }
      aside={<RunStatusBadge status={run.status} />}
      bodyClassName="px-4 py-3"
    >
      <dl className="grid grid-cols-2 gap-x-4 gap-y-3">
        {facts.map(([name, value]) => (
          <div key={name} className="min-w-0">
            <dt className="text-[0.78rem] tracking-wider text-muted uppercase">{name}</dt>
            <dd className="mt-0.5 truncate font-terminal text-sm tabular-nums">{value}</dd>
          </div>
        ))}
      </dl>
      <Link href={`/w/${slug}/runs/${run.id}`} className="ui-focus mt-3 inline-block text-xs text-muted underline-offset-4 hover:text-foreground hover:underline">
        open the full trace
      </Link>
    </Panel>
  );
}

function StepCell({ step }: { step: KeptStep }) {
  return (
    <span className="flex min-w-0 items-baseline justify-between gap-3">
      <span className="truncate">
        {optimizationLabel(step.type)}
        <span className="ml-1.5 font-terminal text-xs text-muted">{step.site === null ? "" : `site ${step.site}`}</span>
      </span>
      <span className="shrink-0 font-terminal text-xs text-muted tabular-nums">
        {step.delta === null ? "" : step.delta.toFixed(3)}
      </span>
    </span>
  );
}

export default async function CompareRunsPage({
  params,
  searchParams,
}: {
  params: Promise<{ workspace: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { workspace: slug } = await params;
  const query = await searchParams;
  const { workspace, principal } = await requireWorkspace(slug);
  if (!authorize(principal, "trace:view")) notFound();

  const idA = typeof query.a === "string" ? query.a : "";
  const idB = typeof query.b === "string" ? query.b : "";
  const [runA, runB] = await Promise.all([
    idA ? findRunWithEvents(prisma, idA) : null,
    idB ? findRunWithEvents(prisma, idB) : null,
  ]);
  const inWorkspace = (run: RunWithEvents | null) => run !== null && run.program.project.workspaceId === workspace.id;
  if (!inWorkspace(runA)) notFound();
  const a = runA as RunWithEvents;
  const b = inWorkspace(runB) ? (runB as RunWithEvents) : null;

  const choices = await listRunsForProgram(prisma, a.programId);
  const picker = (
    <form method="get" className="flex flex-wrap items-end gap-3">
      <Field label="Run A" htmlFor="compare-a">
        <Select id="compare-a" name="a" defaultValue={a.id} className="w-80 max-w-full">
          {choices.map((run) => (
            <option key={run.id} value={run.id}>
              {methodLabel(run.method)} / seed {run.seed} / {formatWhen(run.startedAt)}
            </option>
          ))}
        </Select>
      </Field>
      <Field label="Run B" htmlFor="compare-b">
        <Select id="compare-b" name="b" defaultValue={b?.id ?? ""} className="w-80 max-w-full">
          <option value="" disabled>
            Pick a run
          </option>
          {choices
            .filter((run) => run.id !== a.id)
            .map((run) => (
              <option key={run.id} value={run.id}>
                {methodLabel(run.method)} / seed {run.seed} / {formatWhen(run.startedAt)}
              </option>
            ))}
        </Select>
      </Field>
      <Button type="submit" variant="secondary">
        Compare
      </Button>
    </form>
  );

  const header = (
    <PageHeader
      eyebrow={
        <>
          <Link href={`/w/${slug}/runs`} className="ui-focus underline-offset-4 hover:underline">
            runs
          </Link>{" "}
          / compare
        </>
      }
      title={a.program.name}
      lead="Two runs of the same program: where the searches parted, and what each ended up with."
    />
  );

  if (b === null) {
    return (
      <PageMain>
        {header}
        <Panel bodyClassName="px-4 py-4">{picker}</Panel>
        <Panel className="mt-6">
          <EmptyState title="Pick a second run">
            {choices.length > 1
              ? "Choose another run of this program to compare against."
              : "This program has only one run. Run it again with another method first."}
          </EmptyState>
        </Panel>
      </PageMain>
    );
  }

  const traceA = foldTrace(replayEvents(a.events).events);
  const traceB = foldTrace(replayEvents(b.events).events);
  const keptA = keptSteps(traceA);
  const keptB = keptSteps(traceB);
  const rows = alignSteps(keptA, keptB);
  const counts = kindCounts(keptA, keptB);
  const shared = rows.filter((row) => row.kind === "both").length;
  const difference =
    traceA.summary.reductionPercent === null || traceB.summary.reductionPercent === null
      ? null
      : traceB.summary.reductionPercent - traceA.summary.reductionPercent;
  const maxCount = Math.max(1, ...counts.flatMap((count) => [count.a, count.b]));

  return (
    <PageMain>
      {header}
      <Panel bodyClassName="px-4 py-4" className="mb-6">
        {picker}
      </Panel>

      {a.programId !== b.programId ? (
        <Callout tone="caution" className="mb-6">
          These runs are of different programs, so the listings below differ for that reason too.
        </Callout>
      ) : null}

      <div className="grid grid-cols-1 items-start gap-4 md:grid-cols-2">
        <Side label="A" run={a} trace={traceA} slug={slug} />
        <Side label="B" run={b} trace={traceB} slug={slug} />
      </div>

      <p className="mt-4 text-sm text-foreground/75">
        {difference === null
          ? "One of the runs has no final cost, so the reductions cannot be compared."
          : Math.abs(difference) < 0.05
            ? "Both runs took the same amount off."
            : `${difference > 0 ? "B" : "A"} took ${Math.abs(difference).toFixed(1)} points more off the cost.`}{" "}
        {shared} of their kept rewrites line up; {keptA.length - shared} only in A, {keptB.length - shared} only in B.
      </p>

      <div className="mt-6 grid grid-cols-1 items-start gap-6 xl:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <Panel title="Kept rewrites, aligned" aside={`${rows.length} rows`}>
          {rows.length === 0 ? (
            <EmptyState compact title="Neither run kept a rewrite" />
          ) : (
            <ol className="divide-y divide-line text-sm">
              {rows.map((row, index) => (
                <li key={index} className="grid grid-cols-2 gap-4 px-4 py-2">
                  <div className={cx("min-w-0", row.kind === "b" && "opacity-0")}>
                    {row.kind === "b" ? null : <StepCell step={row.a} />}
                  </div>
                  <div className={cx("min-w-0", row.kind === "a" && "opacity-0")}>
                    {row.kind === "a" ? null : <StepCell step={row.b} />}
                  </div>
                  {row.kind === "both" ? null : (
                    <span className="sr-only">only in {row.kind === "a" ? "A" : "B"}</span>
                  )}
                </li>
              ))}
            </ol>
          )}
          <p className="border-t border-line px-4 py-2 text-xs text-muted">
            Rows pair the same kind of rewrite in order. A blank side means only the other run kept one there.
            The number is the change in weighted cost; negative is cheaper.
          </p>
        </Panel>

        <Panel title="Kept, by kind" bodyClassName="px-4 py-4">
          {counts.length === 0 ? (
            <p className="text-sm text-muted">Nothing kept.</p>
          ) : (
            <ul className="flex flex-col gap-3">
              {counts.map((count) => (
                <li key={count.type}>
                  <div className="mb-1 flex justify-between text-sm">
                    <span>{optimizationLabel(count.type)}</span>
                    <span className="font-terminal text-xs text-muted tabular-nums">
                      A {count.a} / B {count.b}
                    </span>
                  </div>
                  <div className="flex flex-col gap-0.5">
                    <span className="h-1.5 rounded-full bg-ramp-1" style={{ width: `${(count.a / maxCount) * 100}%`, minWidth: count.a ? 3 : 0 }} />
                    <span className="h-1.5 rounded-full bg-ramp-3" style={{ width: `${(count.b / maxCount) * 100}%`, minWidth: count.b ? 3 : 0 }} />
                  </div>
                </li>
              ))}
            </ul>
          )}
          <p className="mt-4 flex gap-4 text-xs text-muted">
            <span className="flex items-center gap-1.5">
              <span aria-hidden className="size-2.5 rounded-sm bg-ramp-1" /> A
            </span>
            <span className="flex items-center gap-1.5">
              <span aria-hidden className="size-2.5 rounded-sm bg-ramp-3" /> B
            </span>
          </p>
        </Panel>

        <Panel title="Final listings, A to B" className="xl:col-span-2" bodyClassName="px-4 py-4">
          {traceA.finalTac !== null && traceB.finalTac !== null ? (
            <DiffView before={traceA.finalTac} after={traceB.finalTac} />
          ) : (
            <p className="text-sm text-muted">
              <Badge tone="caution">incomplete</Badge> One of the runs did not converge, so it has no final listing.
            </p>
          )}
        </Panel>
      </div>
    </PageMain>
  );
}
