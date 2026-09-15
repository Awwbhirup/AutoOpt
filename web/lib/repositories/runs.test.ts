import { describe, expect, it } from "vitest";

import { fakePrisma } from "../test-support/fake-prisma";
import {
  appendRunEvents,
  finalizeRun,
  findRunWithEvents,
  listRecentRuns,
} from "./runs";

describe("findRunWithEvents", () => {
  it("loads one run by id", async () => {
    const db = fakePrisma({ "run.findUnique": null });
    await findRunWithEvents(db.client, "run_1");

    const call = db.only();
    expect(call.model).toBe("run");
    expect(call.method).toBe("findUnique");
    expect(call.args.where).toEqual({ id: "run_1" });
  });

  it("orders the decision log by seq", async () => {
    const db = fakePrisma({ "run.findUnique": null });
    await findRunWithEvents(db.client, "run_1");

    expect(db.only().args.select).toMatchObject({
      events: { orderBy: { seq: "asc" } },
    });
  });

  it("carries the program source, which the list deliberately omits", async () => {
    const db = fakePrisma({ "run.findUnique": null });
    await findRunWithEvents(db.client, "run_1");

    expect(db.only().args.select).toMatchObject({
      program: { select: { source: true } },
    });
  });

  it("carries the workspace the run belongs to, for the caller to check", async () => {
    const db = fakePrisma({ "run.findUnique": null });
    await findRunWithEvents(db.client, "run_1");

    expect(db.only().args.select).toMatchObject({
      program: { select: { project: { select: { workspaceId: true } } } },
    });
  });
});

describe("listRecentRuns", () => {
  it("reaches the workspace through program and project", async () => {
    const db = fakePrisma({ "run.findMany": [] });
    await listRecentRuns(db.client, "ws_1");

    const call = db.only();
    expect(call.model).toBe("run");
    expect(call.args.where).toEqual({
      program: { project: { workspaceId: "ws_1" } },
    });
  });

  it("orders by start time, newest first, and takes a page", async () => {
    const db = fakePrisma({ "run.findMany": [] });
    await listRecentRuns(db.client, "ws_1");

    const call = db.only();
    expect(call.args.orderBy).toEqual({ startedAt: "desc" });
    expect(call.args.take).toBe(20);
  });

  it("honours an explicit limit", async () => {
    const db = fakePrisma({ "run.findMany": [] });
    await listRecentRuns(db.client, "ws_1", 5);

    expect(db.only().args.take).toBe(5);
  });
});

describe("appendRunEvents", () => {
  const events = [
    { seq: 1, kind: "run_started", payload: { kind: "run_started" } },
    { seq: 2, kind: "decision", payload: { kind: "decision" } },
  ];

  it("writes the batch with the run id stamped on every row", async () => {
    const db = fakePrisma({ "runEvent.createMany": { count: 2 } });
    const written = await appendRunEvents(db.client, "run_1", events);

    const call = db.only();
    expect(call.model).toBe("runEvent");
    expect(call.method).toBe("createMany");
    expect(call.args.data).toEqual([
      {
        runId: "run_1",
        seq: 1,
        kind: "run_started",
        payload: { kind: "run_started" },
      },
      {
        runId: "run_1",
        seq: 2,
        kind: "decision",
        payload: { kind: "decision" },
      },
    ]);
    expect(written).toBe(2);
  });

  it("skips duplicates, so a resumed stream does not fail the batch", async () => {
    const db = fakePrisma({ "runEvent.createMany": { count: 1 } });
    const written = await appendRunEvents(db.client, "run_1", events);

    expect(db.only().args.skipDuplicates).toBe(true);
    // One of the two was already stored. The answer is what the database
    // wrote, not how many rows were offered to it.
    expect(written).toBe(1);
  });

  it("does not go to the database for an empty batch", async () => {
    const db = fakePrisma();
    expect(await appendRunEvents(db.client, "run_1", [])).toBe(0);
    expect(db.calls).toHaveLength(0);
  });
});

describe("finalizeRun", () => {
  it("writes the outcome and stamps the finish time", async () => {
    const db = fakePrisma({ "run.update": {} });
    const finishedAt = new Date("2026-01-02T03:04:05.000Z");
    await finalizeRun(db.client, "run_1", {
      status: "SUCCEEDED",
      costBefore: 12,
      costAfter: 7.5,
      outputMatch: true,
      finalProof: "proven_equivalent",
      finishedAt,
    });

    const call = db.only();
    expect(call.model).toBe("run");
    expect(call.method).toBe("update");
    expect(call.args.where).toEqual({ id: "run_1" });
    expect(call.args.data).toEqual({
      status: "SUCCEEDED",
      costBefore: 12,
      costAfter: 7.5,
      outputMatch: true,
      finalProof: "proven_equivalent",
      error: undefined,
      finishedAt,
    });
  });

  it("defaults the finish time to now", async () => {
    const db = fakePrisma({ "run.update": {} });
    const before = Date.now();
    await finalizeRun(db.client, "run_1", { status: "FAILED", error: "boom" });

    const data = db.only().args.data as { finishedAt: Date };
    expect(data.finishedAt.getTime()).toBeGreaterThanOrEqual(before);
  });

  it("records why a run failed", async () => {
    const db = fakePrisma({ "run.update": {} });
    await finalizeRun(db.client, "run_1", { status: "FAILED", error: "boom" });

    const data = db.only().args.data as Record<string, unknown>;
    expect(data.status).toBe("FAILED");
    expect(data.error).toBe("boom");
  });

  it("leaves omitted columns alone rather than clearing them", async () => {
    const db = fakePrisma({ "run.update": {} });
    await finalizeRun(db.client, "run_1", { status: "ABANDONED" });

    const data = db.only().args.data as Record<string, unknown>;
    expect(data.costBefore).toBeUndefined();
    expect(data.costAfter).toBeUndefined();
    expect(data.outputMatch).toBeUndefined();
    expect(data.finalProof).toBeUndefined();
    expect(data.error).toBeUndefined();
  });
});
