import { describe, expect, it } from "vitest";

import { alignSteps, kindCounts, type KeptStep } from "./compare";

const step = (index: number, type: string, delta: number | null = -0.1): KeptStep => ({
  index,
  type: type as KeptStep["type"],
  site: index,
  delta,
});

describe("alignSteps", () => {
  it("pairs the same kinds in order and leaves the rest on one side", () => {
    const a = [step(1, "constant_folding"), step(2, "dead_code_elimination"), step(3, "copy_propagation")];
    const b = [step(1, "constant_folding"), step(2, "loop_invariant_code_motion"), step(3, "copy_propagation")];
    expect(alignSteps(a, b).map((row) => row.kind)).toEqual(["both", "a", "b", "both"]);
  });

  it("handles one side empty", () => {
    expect(alignSteps([], [step(1, "constant_folding")]).map((row) => row.kind)).toEqual(["b"]);
    expect(alignSteps([], [])).toEqual([]);
  });
});

describe("kindCounts", () => {
  it("counts per kind and puts the biggest difference first", () => {
    const counts = kindCounts(
      [step(1, "constant_folding"), step(2, "constant_folding"), step(3, "copy_propagation")],
      [step(1, "copy_propagation"), step(2, "dead_code_elimination"), step(3, "dead_code_elimination"), step(4, "dead_code_elimination")],
    );
    expect(counts[0]).toEqual({ type: "dead_code_elimination", a: 0, b: 3 });
    expect(counts.find((c) => c.type === "copy_propagation")).toEqual({ type: "copy_propagation", a: 1, b: 1 });
  });
});
