import { describe, expect, it } from "vitest";

import { EMPTY_GRID, planRuns, plannedCount, readGrid, suiteGrid } from "./grid";

describe("suite grid", () => {
  it("reads a stored grid and falls back to empty on junk", () => {
    expect(readGrid({ methods: ["greedy"], seeds: [0, 1] })).toEqual({
      methods: ["greedy"],
      seeds: [0, 1],
      proveFinal: false,
    });
    expect(readGrid(null)).toEqual(EMPTY_GRID);
    expect(readGrid({ methods: "greedy" })).toEqual(EMPTY_GRID);
  });

  it("refuses a grid with no methods or too many seeds", () => {
    expect(suiteGrid.safeParse({ methods: [], seeds: [0] }).success).toBe(false);
    expect(suiteGrid.safeParse({ methods: ["a"], seeds: [0, 1, 2, 3, 4, 5] }).success).toBe(false);
  });

  it("plans seed, then program, then method, without duplicates", () => {
    const plan = planRuns(["p1", "p2"], {
      methods: ["greedy", "astar", "greedy"],
      seeds: [0, 1],
      proveFinal: false,
    });

    expect(plan).toHaveLength(8);
    expect(plan.slice(0, 2)).toEqual([
      { programId: "p1", method: "greedy", seed: 0 },
      { programId: "p1", method: "astar", seed: 0 },
    ]);
    expect(plan[4]).toEqual({ programId: "p1", method: "greedy", seed: 1 });
    expect(plannedCount(2, { methods: ["greedy", "astar", "greedy"], seeds: [0, 1], proveFinal: false })).toBe(8);
  });
});
