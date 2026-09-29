/**
 * What a suite run found, computed from its run rows.
 *
 * Pure, so the numbers on the results page, the CSV and the tests are the same
 * function. A reduction is only counted for a run that finished with both
 * costs; a failed or abandoned run is counted as such, never as a zero.
 */

import type { RunStatus } from "@prisma/client";

import { methodMeta } from "../methods";
import { percentReduction } from "../trace";

export interface SuiteRunRow {
  id: string;
  programId: string;
  programName: string;
  category: string;
  method: string;
  seed: number;
  status: RunStatus;
  costBefore: number | null;
  costAfter: number | null;
  outputMatch: boolean | null;
  finalProof: string | null;
}

export interface Spread {
  n: number;
  mean: number | null;
  median: number | null;
  q1: number | null;
  q3: number | null;
  min: number | null;
  max: number | null;
}

export interface MethodResult {
  method: string;
  label: string;
  baseline: boolean;
  planned: number;
  succeeded: number;
  failed: number;
  abandoned: number;
  pending: number;
  reductions: number[];
  spread: Spread;
  pass: number;
  fail: number;
  unchecked: number;
  /** Z3's final verdicts, by name, for the runs that asked for one. */
  proofs: Record<string, number>;
}

export interface ProgramCell {
  /** Mean over the seeds that finished; null when none did. */
  reduction: number | null;
  runs: number;
  finished: number;
  outputFailed: boolean;
  /** A run to link to: the first one for this program and method. */
  runId: string;
}

export interface ProgramResult {
  programId: string;
  name: string;
  category: string;
  cells: Record<string, ProgramCell>;
  /** The method with the largest reduction here, when any finished. */
  best: string | null;
}

export interface SuiteResults {
  methods: MethodResult[];
  programs: ProgramResult[];
  total: number;
  finished: number;
  /** Mean over every finished run, controls included. */
  overallMean: number | null;
  /** Mean over the finished runs of methods that are not controls. */
  searchMean: number | null;
}

/** Linear interpolation between order statistics (the usual type 7). */
export function quantile(sorted: readonly number[], q: number): number | null {
  if (sorted.length === 0) return null;
  const position = (sorted.length - 1) * q;
  const low = Math.floor(position);
  const high = Math.ceil(position);
  return sorted[low] + (sorted[high] - sorted[low]) * (position - low);
}

export function spread(values: readonly number[]): Spread {
  const sorted = [...values].sort((a, b) => a - b);
  const n = sorted.length;
  return {
    n,
    mean: n === 0 ? null : sorted.reduce((sum, value) => sum + value, 0) / n,
    median: quantile(sorted, 0.5),
    q1: quantile(sorted, 0.25),
    q3: quantile(sorted, 0.75),
    min: n === 0 ? null : sorted[0],
    max: n === 0 ? null : sorted[n - 1],
  };
}

export function reductionOf(row: SuiteRunRow): number | null {
  if (row.status !== "SUCCEEDED" || row.costBefore === null || row.costAfter === null) {
    return null;
  }
  return percentReduction(row.costBefore, row.costAfter);
}

function mean(values: readonly number[]): number | null {
  return values.length === 0 ? null : values.reduce((sum, value) => sum + value, 0) / values.length;
}

/**
 * Everything the results page draws.
 *
 * Methods come back ordered by median reduction, lowest first, so the ramp can
 * be applied by position: worst in violet, best in green. `methodOrder` fixes
 * which methods appear even before any of their runs have finished.
 */
export function summarizeSuite(
  rows: readonly SuiteRunRow[],
  methodOrder: readonly string[] = [],
): SuiteResults {
  const names = [...new Set([...methodOrder, ...rows.map((row) => row.method)])];

  const methods: MethodResult[] = names.map((method) => {
    const mine = rows.filter((row) => row.method === method);
    const reductions = mine.map(reductionOf).filter((value): value is number => value !== null);
    const proofs: Record<string, number> = {};
    for (const row of mine) {
      if (row.finalProof !== null) proofs[row.finalProof] = (proofs[row.finalProof] ?? 0) + 1;
    }
    const meta = methodMeta(method);
    return {
      method,
      label: meta.label,
      baseline: meta.baseline,
      planned: mine.length,
      succeeded: mine.filter((row) => row.status === "SUCCEEDED").length,
      failed: mine.filter((row) => row.status === "FAILED").length,
      abandoned: mine.filter((row) => row.status === "ABANDONED").length,
      pending: mine.filter((row) => row.status === "QUEUED" || row.status === "RUNNING").length,
      reductions,
      spread: spread(reductions),
      pass: mine.filter((row) => row.outputMatch === true).length,
      fail: mine.filter((row) => row.outputMatch === false).length,
      unchecked: mine.filter(
        (row) => row.outputMatch === null && row.status !== "QUEUED" && row.status !== "RUNNING",
      ).length,
      proofs,
    };
  });

  methods.sort((a, b) => {
    const left = a.spread.median ?? Number.NEGATIVE_INFINITY;
    const right = b.spread.median ?? Number.NEGATIVE_INFINITY;
    return left - right || a.method.localeCompare(b.method);
  });

  const programOrder: string[] = [];
  const byProgram = new Map<string, SuiteRunRow[]>();
  for (const row of rows) {
    const list = byProgram.get(row.programId);
    if (list) list.push(row);
    else {
      byProgram.set(row.programId, [row]);
      programOrder.push(row.programId);
    }
  }

  const programs: ProgramResult[] = programOrder.map((programId) => {
    const mine = byProgram.get(programId) ?? [];
    const cells: Record<string, ProgramCell> = {};
    for (const method of names) {
      const runs = mine.filter((row) => row.method === method);
      if (runs.length === 0) continue;
      const finished = runs
        .map(reductionOf)
        .filter((value): value is number => value !== null);
      cells[method] = {
        reduction: mean(finished),
        runs: runs.length,
        finished: finished.length,
        outputFailed: runs.some((row) => row.outputMatch === false),
        runId: runs[0].id,
      };
    }
    let best: string | null = null;
    for (const [method, cell] of Object.entries(cells)) {
      if (cell.reduction === null) continue;
      if (best === null || cell.reduction > (cells[best].reduction ?? Number.NEGATIVE_INFINITY)) {
        best = method;
      }
    }
    return { programId, name: mine[0].programName, category: mine[0].category, cells, best };
  });

  const finishedRows = rows.filter((row) => reductionOf(row) !== null);
  const all = finishedRows.map((row) => reductionOf(row) as number);
  const searches = finishedRows
    .filter((row) => !methodMeta(row.method).baseline)
    .map((row) => reductionOf(row) as number);

  return {
    methods,
    programs,
    total: rows.length,
    finished: rows.filter((row) => row.status !== "QUEUED" && row.status !== "RUNNING").length,
    overallMean: mean(all),
    searchMean: mean(searches),
  };
}

function csvCell(value: string | number | boolean | null): string {
  if (value === null) return "";
  const text = String(value);
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

/** One line per run, with the reduction worked out the way the page works it out. */
export function suiteCsv(rows: readonly SuiteRunRow[]): string {
  const header = [
    "run_id",
    "program",
    "category",
    "method",
    "baseline",
    "seed",
    "status",
    "cost_before",
    "cost_after",
    "reduction_percent",
    "output_match",
    "final_proof",
  ];
  const lines = rows.map((row) => {
    const reduction = reductionOf(row);
    return [
      row.id,
      row.programName,
      row.category,
      row.method,
      methodMeta(row.method).baseline,
      row.seed,
      row.status.toLowerCase(),
      row.costBefore,
      row.costAfter,
      reduction === null ? null : Number(reduction.toFixed(4)),
      row.outputMatch,
      row.finalProof,
    ]
      .map(csvCell)
      .join(",");
  });
  return [header.join(","), ...lines].join("\n") + "\n";
}
