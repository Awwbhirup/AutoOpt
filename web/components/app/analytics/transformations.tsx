/**
 * Which rewrites the engine proposes and which it keeps: one row per kind, a
 * bar filled to the share that was accepted (the track is everything proposed),
 * the counts, and the mean cost change of the ones kept. A share rather than a
 * count, because one kind proposed a thousand times would flatten the rest.
 */

import type { TransformationStat } from "@/lib/analytics";
import { optimizationLabel, type OptimizationType } from "@/lib/trace";

export function kindLabel(kind: string): string {
  return optimizationLabel(kind as OptimizationType) ?? kind.replace(/_/g, " ");
}

export function TransformationBars({ stats }: { stats: TransformationStat[] }) {
  return (
    <figure className="m-0">
      <ul className="mb-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-foreground/75">
        <li className="flex items-center gap-1.5">
          <span aria-hidden className="size-2.5 rounded-sm bg-ramp-2/25" /> turned down
        </li>
        <li className="flex items-center gap-1.5">
          <span aria-hidden className="size-2.5 rounded-sm bg-ramp-2" /> accepted
        </li>
      </ul>
      <div className="flex flex-col gap-2.5">
        {stats.map((stat) => (
          <div
            key={stat.kind}
            className="grid grid-cols-[minmax(0,9rem)_minmax(0,1fr)] items-center gap-3 sm:grid-cols-[minmax(0,13rem)_minmax(0,1fr)_7rem]"
          >
            <div className="min-w-0">
              <div className="truncate text-sm font-semibold">{kindLabel(stat.kind)}</div>
              <div className="font-terminal text-xs text-muted tabular-nums">
                {stat.accepted}/{stat.proposed} kept
              </div>
            </div>
            <div
              className="relative h-3"
              title={`${kindLabel(stat.kind)}: ${stat.accepted} accepted of ${stat.proposed} proposed`}
            >
              <span className="absolute inset-0 rounded-[4px] bg-ramp-2/25" />
              <span
                className="absolute inset-y-0 left-0 rounded-[4px] bg-ramp-2"
                style={{
                  width: stat.proposed === 0 ? 0 : `${(stat.accepted / stat.proposed) * 100}%`,
                  minWidth: stat.accepted > 0 ? 3 : 0,
                }}
              />
            </div>
            <div className="hidden text-right font-terminal text-xs tabular-nums sm:block">
              {stat.proposed === 0 ? "-" : `${((stat.accepted / stat.proposed) * 100).toFixed(0)}%`}
              <span className="block text-muted">
                {stat.meanDelta === null ? "no change kept" : `${stat.meanDelta.toFixed(3)} cost`}
              </span>
            </div>
          </div>
        ))}
      </div>
    </figure>
  );
}
