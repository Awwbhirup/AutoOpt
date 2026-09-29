import { describe, expect, it } from "vitest";

import { css, hexToRgb, RAMP } from "../components/landing/ramp";

import { rampAt } from "./ramp";

const stop = (index: number) => css(hexToRgb(RAMP[index]));

describe("rampAt", () => {
  it("returns the end stops at 0 and 1", () => {
    expect(rampAt(0)).toBe(stop(0));
    expect(rampAt(1)).toBe(stop(RAMP.length - 1));
  });

  it("lands on the inner stops at even steps", () => {
    const step = 1 / (RAMP.length - 1);
    expect(rampAt(step)).toBe(stop(1));
    expect(rampAt(step * 2)).toBe(stop(2));
  });

  it("clamps out of range values and treats NaN as the worst end", () => {
    expect(rampAt(-2)).toBe(stop(0));
    expect(rampAt(5)).toBe(stop(RAMP.length - 1));
    expect(rampAt(Number.NaN)).toBe(stop(0));
  });

  it("blends between stops", () => {
    const between = rampAt(0.125);
    expect(between).not.toBe(stop(0));
    expect(between).not.toBe(stop(1));
  });
});
