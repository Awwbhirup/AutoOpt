import { describe, expect, it } from "vitest";

import { decodeState, encodeState } from "./url-state";

describe("playground url state", () => {
  it("round trips source and method", () => {
    const state = { source: "input x;\nint a = 2 + 3;\nprint(a + x);\n", method: "astar" };
    const hash = encodeState(state);
    expect(hash).not.toContain(" ");
    expect(decodeState(`#${hash}`)).toEqual(state);
  });

  it("returns null for an empty or broken hash", () => {
    expect(decodeState("")).toBeNull();
    expect(decodeState("#code=")).toBeNull();
    expect(decodeState("#m=greedy")).toBeNull();
  });

  it("falls back to greedy when the method is not a plain name", () => {
    const hash = encodeState({ source: "print(1);", method: "greedy" }).replace("m=greedy", "m=%3Cscript%3E");
    expect(decodeState(hash)?.method).toBe("greedy");
  });
});
