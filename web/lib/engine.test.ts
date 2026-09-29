import { beforeEach, describe, expect, it, vi } from "vitest";

const listing = vi.hoisted(() => ({ result: [] as unknown[] | Error }));

vi.mock("./service", () => ({
  methods: () =>
    listing.result instanceof Error ? Promise.reject(listing.result) : Promise.resolve(listing.result),
}));

import { engineStatus, runnableMethods } from "./engine";

describe("engineStatus", () => {
  beforeEach(() => {
    listing.result = [];
  });

  it("reports offline when the service cannot be reached", async () => {
    listing.result = new Error("ECONNREFUSED");
    expect(await engineStatus()).toEqual({ online: false, methods: [] });
  });

  it("treats a method without an availability flag as runnable", async () => {
    listing.result = [
      { name: "greedy", kind: "rule_based" },
      { name: "llm", kind: "llm", available: false },
    ];
    const status = await engineStatus();
    expect(status.online).toBe(true);
    expect(runnableMethods(status)).toEqual(["greedy"]);
  });
});
