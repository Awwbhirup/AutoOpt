/**
 * Comparing two runs of the same program: the rewrites each one kept, lined
 * up so the same kind of rewrite in both reads as one row, and counts per kind.
 * Alignment is a longest common subsequence over rewrite kinds, the same idea
 * as a line diff, because the question is "where did the two searches part".
 */

import type { OptimizationType, Trace } from "./trace";

export interface KeptStep {
  index: number;
  type: OptimizationType;
  site: number | null;
  /** Weighted-cost change of the step; negative is cheaper. Null if it was not priced. */
  delta: number | null;
}

export function keptSteps(trace: Trace): KeptStep[] {
  return trace.steps
    .filter((step) => step.outcome?.accepted === true)
    .map((step) => ({
      index: step.index,
      type: step.optimizationType,
      site: step.site,
      delta: step.cost === null ? null : step.cost.after.weighted_total - step.cost.before.weighted_total,
    }));
}

export type AlignedRow =
  | { kind: "both"; a: KeptStep; b: KeptStep }
  | { kind: "a"; a: KeptStep }
  | { kind: "b"; b: KeptStep };

export function alignSteps(a: readonly KeptStep[], b: readonly KeptStep[]): AlignedRow[] {
  const n = a.length;
  const m = b.length;
  const lcs: number[][] = Array.from({ length: n + 1 }, () => new Array<number>(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i -= 1) {
    for (let j = m - 1; j >= 0; j -= 1) {
      lcs[i][j] = a[i].type === b[j].type ? lcs[i + 1][j + 1] + 1 : Math.max(lcs[i + 1][j], lcs[i][j + 1]);
    }
  }
  const rows: AlignedRow[] = [];
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (a[i].type === b[j].type) {
      rows.push({ kind: "both", a: a[i], b: b[j] });
      i += 1;
      j += 1;
    } else if (lcs[i + 1][j] >= lcs[i][j + 1]) {
      rows.push({ kind: "a", a: a[i] });
      i += 1;
    } else {
      rows.push({ kind: "b", b: b[j] });
      j += 1;
    }
  }
  for (; i < n; i += 1) rows.push({ kind: "a", a: a[i] });
  for (; j < m; j += 1) rows.push({ kind: "b", b: b[j] });
  return rows;
}

export interface KindCount {
  type: OptimizationType;
  a: number;
  b: number;
}

/** Kept rewrites per kind in each run, the kinds that differ most first. */
export function kindCounts(a: readonly KeptStep[], b: readonly KeptStep[]): KindCount[] {
  const counts = new Map<OptimizationType, KindCount>();
  for (const step of a) {
    const entry = counts.get(step.type) ?? { type: step.type, a: 0, b: 0 };
    entry.a += 1;
    counts.set(step.type, entry);
  }
  for (const step of b) {
    const entry = counts.get(step.type) ?? { type: step.type, a: 0, b: 0 };
    entry.b += 1;
    counts.set(step.type, entry);
  }
  return [...counts.values()].sort(
    (x, y) => Math.abs(y.a - y.b) - Math.abs(x.a - x.b) || y.a + y.b - (x.a + x.b) || x.type.localeCompare(y.type),
  );
}
