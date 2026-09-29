import { describe, expect, it } from "vitest";

import { diffLines, diffStats } from "./diff";

describe("diffLines", () => {
  it("keeps common lines and marks the rest", () => {
    const lines = diffLines(["a", "b", "c"], ["a", "x", "c", "d"]);
    expect(lines.map((line) => `${line.kind}:${line.text}`)).toEqual([
      "same:a",
      "del:b",
      "add:x",
      "same:c",
      "add:d",
    ]);
    expect(diffStats(lines)).toEqual({ added: 2, removed: 1 });
  });

  it("numbers lines on each side", () => {
    const lines = diffLines(["t1 = 2 * 3", "print t1"], ["print 6"]);
    expect(lines[0]).toEqual({ kind: "del", text: "t1 = 2 * 3", before: 1 });
    expect(lines.at(-1)).toEqual({ kind: "add", text: "print 6", after: 1 });
  });

  it("handles empty sides", () => {
    expect(diffLines([], [])).toEqual([]);
    expect(diffLines(["a"], []).map((line) => line.kind)).toEqual(["del"]);
    expect(diffLines([], ["a"]).map((line) => line.kind)).toEqual(["add"]);
  });
});
