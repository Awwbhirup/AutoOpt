import { describe, expect, it } from "vitest";

import {
  byCategory,
  headline,
  readRange,
  runsPerDay,
  slowestPrograms,
  transformationStats,
  type AnalyticsRun,
} from "./analytics";

function run(overrides: Partial<AnalyticsRun>): AnalyticsRun {
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
    startedAt: new Date("2026-09-28T10:00:00Z"),
    finishedAt: new Date("2026-09-28T10:00:04Z"),
    ...overrides,
  };
}

const NOW = new Date("2026-09-29T12:00:00Z");

describe("readRange", () => {
  it("accepts known ranges and defaults to 30 days", () => {
    expect(readRange("7d")).toBe("7d");
    expect(readRange("all")).toBe("all");
    expect(readRange("1y")).toBe("30d");
    expect(readRange(undefined)).toBe("30d");
  });
});

describe("runsPerDay", () => {
  it("has every day in the range, empty ones included", () => {
    const days = runsPerDay(
      [run({}), run({ status: "FAILED" }), run({ startedAt: new Date("2026-09-29T01:00:00Z"), status: "RUNNING" })],
      3,
      NOW,
    );
    expect(days.map((day) => day.day)).toEqual(["2026-09-27", "2026-09-28", "2026-09-29"]);
    expect(days[1]).toEqual({ day: "2026-09-28", succeeded: 1, failed: 1, other: 0 });
    expect(days[2].other).toBe(1);
  });

  it("starts at the first run when the range is open", () => {
    const days = runsPerDay([run({ startedAt: new Date("2026-09-26T09:00:00Z") })], null, NOW);
    expect(days[0].day).toBe("2026-09-26");
    expect(days).toHaveLength(4);
  });

  it("drops runs outside the range", () => {
    const days = runsPerDay([run({ startedAt: new Date("2026-01-01T00:00:00Z") })], 7, NOW);
    expect(days.every((day) => day.succeeded === 0)).toBe(true);
  });
});

describe("headline", () => {
  it("keeps controls out of the search mean and counts only checked outputs", () => {
    const result = headline([
      run({ costAfter: 5 }),
      run({ method: "random_baseline", costAfter: 9 }),
      run({ status: "FAILED", costAfter: null, outputMatch: null }),
      run({ status: "RUNNING", costAfter: null, outputMatch: null }),
    ]);
    expect(result.runs).toBe(4);
    expect(result.finished).toBe(3);
    expect(result.succeededShare).toBeCloseTo(2 / 3);
    expect(result.overallMean).toBeCloseTo(30);
    expect(result.searchMean).toBeCloseTo(50);
    expect(result).toMatchObject({ matched: 2, checked: 2 });
  });
});

describe("byCategory", () => {
  it("averages per category and method, largest first", () => {
    const rows = byCategory(
      [
        run({ category: "loops", costAfter: 9 }),
        run({ category: "arithmetic", costAfter: 5 }),
        run({ category: "arithmetic", method: "astar", costAfter: 3 }),
      ],
      ["greedy", "astar"],
    );
    expect(rows.map((row) => row.category)).toEqual(["arithmetic", "loops"]);
    expect(rows[0].overall.mean).toBeCloseTo(60);
    expect(rows[0].byMethod.astar).toEqual({ n: 1, mean: 70 });
    expect(rows[1].byMethod.astar).toEqual({ n: 0, mean: null });
  });
});

describe("slowestPrograms", () => {
  it("ranks programs by mean duration of finished runs", () => {
    const rows = slowestPrograms([
      run({ programId: "a", programName: "a" }),
      run({ programId: "b", programName: "b", finishedAt: new Date("2026-09-28T10:00:30Z") }),
      run({ programId: "c", programName: "c", finishedAt: null, status: "RUNNING" }),
    ]);
    expect(rows.map((row) => row.name)).toEqual(["b", "a"]);
    expect(rows[0].seconds.mean).toBe(30);
  });
});

describe("transformationStats", () => {
  it("folds accepted and rejected groups per kind", () => {
    const stats = transformationStats([
      { kind: "constant_folding", accepted: true, count: 4, sumDelta: -2 },
      { kind: "constant_folding", accepted: false, count: 6, sumDelta: 0 },
      { kind: "dead_code_elimination", accepted: false, count: 3, sumDelta: 0 },
    ]);
    expect(stats[0]).toEqual({ kind: "constant_folding", proposed: 10, accepted: 4, meanDelta: -0.5 });
    expect(stats[1]).toEqual({ kind: "dead_code_elimination", proposed: 3, accepted: 0, meanDelta: null });
  });
});
