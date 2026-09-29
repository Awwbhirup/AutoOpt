import { describe, expect, it } from "vitest";

import { fakePrisma } from "../test-support/fake-prisma";

import { consumeWorkspaceRun } from "./quota";

const NOW = new Date("2026-09-29T12:00:00Z");
const SEPTEMBER = new Date("2026-09-01T00:00:00Z");

describe("consumeWorkspaceRun", () => {
  it("makes sure the row exists, resets a stale month, then counts one run", async () => {
    const db = fakePrisma({ "quota.updateMany": { count: 1 } });
    expect(await consumeWorkspaceRun(db.client, "ws_1", NOW)).toBe(true);

    const [upsert, reset, count] = db.calls;
    expect(upsert).toMatchObject({
      model: "quota",
      method: "upsert",
      args: { where: { workspaceId: "ws_1" }, update: {} },
    });
    expect(reset.args).toEqual({
      where: { workspaceId: "ws_1", periodStart: { lt: SEPTEMBER } },
      data: { periodStart: SEPTEMBER, usedRuns: 0 },
    });
    expect(count.method).toBe("updateMany");
    expect(count.args.data).toEqual({ usedRuns: { increment: 1 } });
    expect((count.args.where as { workspaceId: string }).workspaceId).toBe("ws_1");
  });

  it("starts the month in UTC, whatever the local day is", async () => {
    const db = fakePrisma({ "quota.updateMany": { count: 1 } });
    await consumeWorkspaceRun(db.client, "ws_1", new Date("2026-10-01T00:30:00+05:30"));
    const reset = db.calls[1];
    expect(reset.args.data).toEqual({ periodStart: SEPTEMBER, usedRuns: 0 });
  });

  it("reports false when the month's budget is spent", async () => {
    const db = fakePrisma({ "quota.updateMany": { count: 0 } });
    expect(await consumeWorkspaceRun(db.client, "ws_1", NOW)).toBe(false);
  });
});
