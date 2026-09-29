/**
 * The workspace analytics, computed from run rows. Pure, so the page and the
 * tests share one definition of every number. Per-method figures reuse the
 * suite summary, so a method's median here and on a suite page mean the same.
 */

import type { RunStatus } from "@prisma/client";

import { methodMeta } from "./methods";
import { reductionOf, spread, type Spread, type SuiteRunRow } from "./suites/results";

export const RANGES = {
  "7d": { days: 7, label: "7 days" },
  "30d": { days: 30, label: "30 days" },
  "90d": { days: 90, label: "90 days" },
  all: { days: null, label: "All time" },
} as const;

export type RangeKey = keyof typeof RANGES;

export function readRange(value: string | string[] | undefined): RangeKey {
  return typeof value === "string" && value in RANGES ? (value as RangeKey) : "30d";
}

export interface AnalyticsRun extends SuiteRunRow {
  startedAt: Date;
  finishedAt: Date | null;
}

export interface DayCount {
  /** yyyy-mm-dd, UTC. */
  day: string;
  succeeded: number;
  failed: number;
  other: number;
}

const DAY_MS = 86_400_000;

function dayKey(at: Date): string {
  return at.toISOString().slice(0, 10);
}

/**
 * Runs per UTC day for the last `days` days ending today, every day present
 * even when empty. With no fixed range, from the first run's day.
 */
export function runsPerDay(runs: readonly AnalyticsRun[], days: number | null, now: Date): DayCount[] {
  const end = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  let start = days === null ? end : end - (days - 1) * DAY_MS;
  if (days === null && runs.length > 0) {
    const first = Math.min(...runs.map((run) => run.startedAt.getTime()));
    const firstDay = new Date(first);
    start = Date.UTC(firstDay.getUTCFullYear(), firstDay.getUTCMonth(), firstDay.getUTCDate());
  }

  const buckets = new Map<string, DayCount>();
  for (let t = start; t <= end; t += DAY_MS) {
    const day = dayKey(new Date(t));
    buckets.set(day, { day, succeeded: 0, failed: 0, other: 0 });
  }
  for (const run of runs) {
    const bucket = buckets.get(dayKey(run.startedAt));
    if (bucket === undefined) continue;
    if (run.status === "SUCCEEDED") bucket.succeeded += 1;
    else if (run.status === "FAILED" || run.status === "ABANDONED") bucket.failed += 1;
    else bucket.other += 1;
  }
  return [...buckets.values()];
}

export interface CategoryCell {
  mean: number | null;
  n: number;
}

export interface CategoryRow {
  category: string;
  overall: CategoryCell;
  byMethod: Record<string, CategoryCell>;
}

function cell(values: number[]): CategoryCell {
  return {
    n: values.length,
    mean: values.length === 0 ? null : values.reduce((sum, value) => sum + value, 0) / values.length,
  };
}

/** Mean reduction per category, overall and per method, largest overall first. */
export function byCategory(runs: readonly AnalyticsRun[], methods: readonly string[]): CategoryRow[] {
  const groups = new Map<string, AnalyticsRun[]>();
  for (const run of runs) {
    const list = groups.get(run.category);
    if (list) list.push(run);
    else groups.set(run.category, [run]);
  }

  const rows = [...groups.entries()].map(([category, list]) => {
    const finished = list.filter((run) => reductionOf(run) !== null);
    const byMethod: Record<string, CategoryCell> = {};
    for (const method of methods) {
      byMethod[method] = cell(
        finished.filter((run) => run.method === method).map((run) => reductionOf(run) as number),
      );
    }
    return { category, overall: cell(finished.map((run) => reductionOf(run) as number)), byMethod };
  });

  return rows.sort((a, b) => (b.overall.mean ?? -Infinity) - (a.overall.mean ?? -Infinity));
}

export interface ProgramTiming {
  programId: string;
  name: string;
  category: string;
  runs: number;
  seconds: Spread;
}

/** Programs by mean wall-clock time of their finished runs, slowest first. */
export function slowestPrograms(runs: readonly AnalyticsRun[], limit = 8): ProgramTiming[] {
  const groups = new Map<string, AnalyticsRun[]>();
  for (const run of runs) {
    if (run.finishedAt === null || run.status === "QUEUED") continue;
    const list = groups.get(run.programId);
    if (list) list.push(run);
    else groups.set(run.programId, [run]);
  }

  return [...groups.values()]
    .map((list) => ({
      programId: list[0].programId,
      name: list[0].programName,
      category: list[0].category,
      runs: list.length,
      seconds: spread(
        list.map((run) => ((run.finishedAt as Date).getTime() - run.startedAt.getTime()) / 1000),
      ),
    }))
    .sort((a, b) => (b.seconds.mean ?? 0) - (a.seconds.mean ?? 0))
    .slice(0, limit);
}

export interface Headline {
  runs: number;
  finished: number;
  succeededShare: number | null;
  overallMean: number | null;
  searchMean: number | null;
  matched: number;
  checked: number;
}

export function headline(runs: readonly AnalyticsRun[]): Headline {
  const finished = runs.filter((run) => run.status !== "QUEUED" && run.status !== "RUNNING");
  const reductions = runs
    .map((run) => ({ run, value: reductionOf(run) }))
    .filter((entry): entry is { run: AnalyticsRun; value: number } => entry.value !== null);
  const mean = (values: number[]) =>
    values.length === 0 ? null : values.reduce((sum, value) => sum + value, 0) / values.length;

  return {
    runs: runs.length,
    finished: finished.length,
    succeededShare:
      finished.length === 0
        ? null
        : finished.filter((run) => run.status === "SUCCEEDED").length / finished.length,
    overallMean: mean(reductions.map((entry) => entry.value)),
    searchMean: mean(
      reductions.filter((entry) => !methodMeta(entry.run.method).baseline).map((entry) => entry.value),
    ),
    matched: runs.filter((run) => run.outputMatch === true).length,
    checked: runs.filter((run) => run.outputMatch !== null).length,
  };
}

export interface TransformationStat {
  kind: string;
  proposed: number;
  accepted: number;
  /** Mean weighted-cost change of the accepted ones; negative is cheaper. */
  meanDelta: number | null;
}

export interface TransformationGroup {
  kind: string;
  accepted: boolean;
  count: number;
  sumDelta: number;
}

/** Folds (kind, accepted) groups into one row per kind, most accepted first. */
export function transformationStats(groups: readonly TransformationGroup[]): TransformationStat[] {
  const byKind = new Map<string, TransformationStat & { sum: number }>();
  for (const group of groups) {
    const entry = byKind.get(group.kind) ?? {
      kind: group.kind,
      proposed: 0,
      accepted: 0,
      meanDelta: null,
      sum: 0,
    };
    entry.proposed += group.count;
    if (group.accepted) {
      entry.accepted += group.count;
      entry.sum += group.sumDelta;
    }
    byKind.set(group.kind, entry);
  }
  return [...byKind.values()]
    .map(({ sum, ...entry }) => ({ ...entry, meanDelta: entry.accepted === 0 ? null : sum / entry.accepted }))
    .sort((a, b) => b.accepted - a.accepted || b.proposed - a.proposed);
}

export const STATUS_ORDER: RunStatus[] = ["SUCCEEDED", "FAILED", "ABANDONED", "RUNNING", "QUEUED"];
