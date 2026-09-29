import { describe, expect, it } from "vitest";

import { assignLanes, BLOCK_WIDTH, blockHeight, layoutCfg, SHOWN_LINES } from "./cfg-layout";

describe("assignLanes", () => {
  it("gives overlapping spans different lanes and reuses lanes for disjoint ones", () => {
    expect(assignLanes([[0, 3], [1, 2], [4, 6]])).toEqual([1, 0, 0]);
    expect(assignLanes([[0, 2], [2, 4]])).toEqual([0, 1]);
    expect(assignLanes([])).toEqual([]);
  });
});

describe("layoutCfg", () => {
  // B0 -> B1 (fallthrough), B1 -> B3 (false, forward), B1 -> B2 (true), B2 -> B1 (back edge).
  const layout = layoutCfg(
    [
      { id: 0, lines: 3 },
      { id: 1, lines: 2 },
      { id: 2, lines: 9 },
      { id: 3, lines: 1 },
    ],
    [
      { source: 0, target: 1, kind: "fallthrough" },
      { source: 1, target: 2, kind: "true" },
      { source: 1, target: 3, kind: "false" },
      { source: 2, target: 1, kind: "jump" },
    ],
  );

  it("stacks blocks in id order without overlap", () => {
    for (let i = 1; i < layout.blocks.length; i += 1) {
      const above = layout.blocks[i - 1];
      expect(layout.blocks[i].y).toBeGreaterThan(above.y + above.height);
    }
    expect(layout.blocks[2].height).toBe(blockHeight(9));
    expect(blockHeight(9)).toBe(blockHeight(SHOWN_LINES + 1));
  });

  it("routes next-block edges down, forward jumps right, loops left", () => {
    expect(layout.edges.map((edge) => edge.side)).toEqual(["down", "down", "right", "left"]);
    const loop = layout.edges[3];
    expect(loop.label.x).toBeLessThan(layout.blocks[0].x);
  });

  it("leaves room for the lanes on both sides", () => {
    expect(layout.width).toBeGreaterThan(BLOCK_WIDTH + 30);
    expect(layout.blocks[0].x).toBeGreaterThan(0);
  });
});
