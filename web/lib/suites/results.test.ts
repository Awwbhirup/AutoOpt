import { describe, expect, it } from "vitest";

import { quantile, spread, suiteCsv, summarizeSuite, type SuiteRunRow } from "./results";

function row(overrides: Partial<SuiteRunRow>): SuiteRunRow {
  return {
    id: "r",
    programId: "p1",
    programName: "loop",
    category: "loops",
    method: "greedy",
    seed: 0,
    status: "SUCCEEDED",
    costBefore: 10,
    costAfter: 8,
    outputMatch: true,
    finalProof: null,
    ...overrides,
  };
}

describe("quantile and spread", () => {
  it("interpolates between order statistics", () => {
    expect(quantile([1, 2, 3, 4], 0.5)).toBe(2.5);
    expect(quantile([1, 2, 3, 4], 0.25)).toBe(1.75);
    expect(quantile([], 0.5)).toBeNull();
  });

  it("summarizes a sample", () => {
    const summary = spread([30, 10, 20]);
    expect(summary).toMatchObject({ n: 3, mean: 20, median: 20, min: 10, max: 30 });
    expect(spread([]).mean).toBeNull();
  });
});

describe("summarizeSuite", () => {
  const rows: SuiteRunRow[] = [
    row({ id: "a", method: "greedy", costAfter: 8 }),
    row({ id: "b", method: "astar", costAfter: 5, finalProof: "proven_equivalent" }),
    row({ id: "c", method: "random_baseline", costAfter: 9 }),
    row({ id: "d", programId: "p2", programName: "dead", method: "greedy", status: "FAILED", costAfter: null, outputMatch: null }),
    row({ id: "e", programId: "p2", programName: "dead", method: "astar", status: "RUNNING", costAfter: null, outputMatch: null }),
    row({ id: "f", programId: "p2", programName: "dead", method: "random_baseline", costAfter: 10, outputMatch: false }),
  ];
  const result = summarizeSuite(rows, ["greedy", "astar", "random_baseline", "hill_climbing"]);

  it("orders methods by median reduction, worst first, keeping ones with no runs", () => {
    expect(result.methods.map((m) => m.method)).toEqual([
      "hill_climbing",
      "random_baseline",
      "greedy",
      "astar",
    ]);
  });

  it("counts failures and pending runs apart from reductions", () => {
    const greedy = result.methods.find((m) => m.method === "greedy")!;
    expect(greedy).toMatchObject({ planned: 2, succeeded: 1, failed: 1, pending: 0, unchecked: 1 });
    expect(greedy.reductions).toEqual([20]);

    const astar = result.methods.find((m) => m.method === "astar")!;
    expect(astar.pending).toBe(1);
    expect(astar.proofs).toEqual({ proven_equivalent: 1 });
  });

  it("marks controls and keeps them out of the search mean", () => {
    expect(result.methods.find((m) => m.method === "random_baseline")!.baseline).toBe(true);
    expect(result.overallMean).toBeCloseTo((20 + 50 + 10 + 0) / 4);
    expect(result.searchMean).toBeCloseTo((20 + 50) / 2);
  });

  it("builds a program by method table with the best method named", () => {
    expect(result.programs.map((p) => p.name)).toEqual(["loop", "dead"]);
    expect(result.programs[0].best).toBe("astar");
    expect(result.programs[1].cells.greedy.reduction).toBeNull();
    expect(result.programs[1].cells.random_baseline.outputFailed).toBe(true);
    expect(result.finished).toBe(5);
  });
});

describe("suiteCsv", () => {
  it("writes a header and quotes what needs it", () => {
    const csv = suiteCsv([row({ id: "x", programName: 'a, "b"' })]);
    const [header, line] = csv.trim().split("\n");
    expect(header.split(",")).toContain("reduction_percent");
    expect(line).toContain('"a, ""b"""');
    expect(line).toContain(",20,");
  });
});
