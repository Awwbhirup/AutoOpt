import type { RunStatus } from "@prisma/client";
import { describe, expect, it } from "vitest";

import type { StreamedEvent } from "../events";
import { advanceSuiteRun, STALE_AFTER_MS, type ClaimedRun, type ExecutorDeps } from "./executor";

function claimed(runId: string): ClaimedRun {
  return {
    runId,
    programId: "p",
    source: "print(1);",
    category: "mixed",
    method: "greedy",
    seed: 0,
    proveFinal: false,
  };
}

const converged = { kind: "run_converged" } as unknown as StreamedEvent;

function harness(queue: string[], behaviour: Record<string, "ok" | "throw"> = {}) {
  const pending = [...queue];
  const recorded: Record<string, string[]> = {};
  const finished: string[] = [];
  const sweeps: Date[] = [];
  let clock = 1_000_000;

  const deps: ExecutorDeps = {
    now: () => clock,
    store: {
      async claimNext() {
        const next = pending.shift();
        return next === undefined ? null : claimed(next);
      },
      async sweepStale(_id, before) {
        sweeps.push(before);
        return 0;
      },
      async refresh() {
        const status: RunStatus = pending.length === 0 ? "SUCCEEDED" : "RUNNING";
        return { remaining: pending.length, status };
      },
    },
    recorder(runId) {
      recorded[runId] = [];
      return {
        async record(event) {
          recorded[runId].push(event.kind);
        },
        async finish() {
          finished.push(runId);
          return "SUCCEEDED";
        },
      };
    },
    async *optimize(run) {
      clock += 1000;
      if (behaviour[run.runId] === "throw") throw new Error("engine down");
      yield converged;
    },
    failure: () => ({ kind: "run_failed" }) as unknown as StreamedEvent,
  };

  return { deps, recorded, finished, sweeps, advanceClock: (ms: number) => (clock += ms), clock: () => clock };
}

describe("advanceSuiteRun", () => {
  it("runs the whole queue and reports the suite closed", async () => {
    const h = harness(["a", "b", "c"]);
    const result = await advanceSuiteRun(h.deps, "s", Number.POSITIVE_INFINITY);

    expect(result).toEqual({ ran: 3, remaining: 0, status: "SUCCEEDED", outOfTime: false });
    expect(h.finished).toEqual(["a", "b", "c"]);
    expect(h.recorded.a).toEqual(["run_converged"]);
  });

  it("records a failure event when the engine throws, and keeps going", async () => {
    const h = harness(["a", "b"], { a: "throw" });
    const result = await advanceSuiteRun(h.deps, "s", Number.POSITIVE_INFINITY);

    expect(h.recorded.a).toEqual(["run_failed"]);
    expect(h.finished).toEqual(["a", "b"]);
    expect(result.ran).toBe(2);
  });

  it("stops between runs once the deadline passes, leaving the rest queued", async () => {
    const h = harness(["a", "b", "c"]);
    const result = await advanceSuiteRun(h.deps, "s", h.clock() + 1500);

    expect(result.ran).toBe(2);
    expect(result.remaining).toBe(1);
    expect(result.outOfTime).toBe(true);
  });

  it("sweeps runs older than the stale window before starting", async () => {
    const h = harness([]);
    await advanceSuiteRun(h.deps, "s", Number.POSITIVE_INFINITY);
    expect(h.sweeps[0].getTime()).toBe(1_000_000 - STALE_AFTER_MS);
  });
});
