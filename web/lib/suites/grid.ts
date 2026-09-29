/**
 * A suite's grid: which methods, at which seeds, over its programs. Stored as
 * Json on the suite and copied onto each suite run, so it is parsed on the way
 * out rather than trusted.
 */

import { z } from "zod";

export const MAX_SUITE_PROGRAMS = 50;
export const MAX_SEEDS = 5;
/** Programs x methods x seeds. Past this a suite is a batch job, not a page. */
export const MAX_SUITE_RUNS = 400;

export const suiteGrid = z.object({
  methods: z.array(z.string().min(1).max(40)).min(1).max(12),
  seeds: z.array(z.number().int().min(0).max(1_000_000)).min(1).max(MAX_SEEDS),
  proveFinal: z.boolean().default(false),
});

export type SuiteGrid = z.infer<typeof suiteGrid>;

export const EMPTY_GRID: SuiteGrid = { methods: [], seeds: [0], proveFinal: false };

/** The stored grid, or an empty one when what is stored does not parse. */
export function readGrid(value: unknown): SuiteGrid {
  const parsed = suiteGrid.safeParse(value);
  return parsed.success ? parsed.data : EMPTY_GRID;
}

export interface PlannedRun {
  programId: string;
  method: string;
  seed: number;
}

/**
 * Every run a suite run will make, in the order it makes them.
 *
 * Seed outermost, then program, then method: the first results to land cover
 * every method on the first program, so a half-finished suite already compares
 * methods rather than having run one method over everything.
 */
export function planRuns(programIds: readonly string[], grid: SuiteGrid): PlannedRun[] {
  const methods = [...new Set(grid.methods)];
  const seeds = [...new Set(grid.seeds)];
  const plan: PlannedRun[] = [];
  for (const seed of seeds) {
    for (const programId of programIds) {
      for (const method of methods) plan.push({ programId, method, seed });
    }
  }
  return plan;
}

export function plannedCount(programs: number, grid: SuiteGrid): number {
  return programs * new Set(grid.methods).size * new Set(grid.seeds).size;
}
