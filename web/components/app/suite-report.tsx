/**
 * The results of a suite run: headline numbers, the spread of cost reduction
 * per method, verification outcomes, and the program by method table. Shared
 * by the workspace results page and the public share page; `slug` turns the
 * table's cells into links to each run's trace, which only members can open.
 */

import { ReductionDistribution } from "@/components/app/suite/distribution";
import { ProgramMatrix } from "@/components/app/suite/matrix";
import { VerificationOutcomes } from "@/components/app/suite/verification";
import { EmptyState } from "@/components/ui/empty-state";
import { Panel, Stat } from "@/components/ui/surface";
import type { SuiteResults } from "@/lib/suites/results";

const pct = (value: number | null) => (value === null ? "n/a" : `${value.toFixed(1)}%`);

export function SuiteReport({ results, slug }: { results: SuiteResults; slug?: string }) {
  const counted = results.methods.reduce((sum, method) => sum + method.pass + method.fail, 0);
  const matched = results.methods.reduce((sum, method) => sum + method.pass, 0);
  const best = [...results.methods].reverse().find((method) => method.spread.median !== null && !method.baseline);

  return (
    <>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Mean reduction" value={pct(results.overallMean)} note="every finished run, controls included" accent="var(--ramp-2)" />
        <Stat label="Search methods" value={pct(results.searchMean)} note="controls left out" accent="var(--ramp-3)" />
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

      {results.total === 0 ? (
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
          <Panel title="By program" aside={`${results.programs.length} programs`} className="xl:col-span-2">
            <ProgramMatrix programs={results.programs} methods={results.methods} slug={slug} />
          </Panel>
        </div>
      )}
    </>
  );
}
