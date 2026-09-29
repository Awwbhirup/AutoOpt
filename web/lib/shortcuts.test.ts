import { describe, expect, it } from "vitest";

import { IDLE_SEQUENCE, isTypingTarget, pressKey, SEQUENCE_MS, shortcutHref, SHORTCUTS } from "./shortcuts";

describe("pressKey", () => {
  it("completes g then a letter within the window", () => {
    const first = pressKey(IDLE_SEQUENCE, "g", 1000, false);
    expect(first.match).toBeNull();
    const second = pressKey(first.state, "s", 1500, false);
    expect(second.match?.label).toBe("Suites");
    expect(second.state).toEqual(IDLE_SEQUENCE);
  });

  it("forgets the first key after the window", () => {
    const first = pressKey(IDLE_SEQUENCE, "g", 1000, false);
    expect(pressKey(first.state, "s", 1000 + SEQUENCE_MS + 1, false).match).toBeNull();
  });

  it("ignores modified keys and keys that start nothing", () => {
    expect(pressKey(IDLE_SEQUENCE, "g", 0, true).state).toEqual(IDLE_SEQUENCE);
    expect(pressKey(IDLE_SEQUENCE, "x", 0, false).state).toEqual(IDLE_SEQUENCE);
    const first = pressKey(IDLE_SEQUENCE, "G", 0, false);
    expect(pressKey(first.state, "D", 10, false).match?.label).toBe("Dashboard");
  });
});

describe("isTypingTarget", () => {
  it("treats fields and editors as typing", () => {
    expect(isTypingTarget({ tagName: "input" })).toBe(true);
    expect(isTypingTarget({ tagName: "DIV", isContentEditable: true })).toBe(true);
    expect(isTypingTarget({ tagName: "BUTTON" })).toBe(false);
    expect(isTypingTarget(null)).toBe(false);
  });
});

describe("shortcutHref", () => {
  it("prefixes workspace paths and leaves site paths alone", () => {
    const byLabel = Object.fromEntries(SHORTCUTS.map((s) => [s.label, s]));
    expect(shortcutHref(byLabel.Dashboard, "acme")).toBe("/w/acme");
    expect(shortcutHref(byLabel.Runs, "acme")).toBe("/w/acme/runs");
    expect(shortcutHref(byLabel.Playground, "acme")).toBe("/try");
  });
});
