/**
 * The log's two obligations: write without ever becoming the reason a change
 * fails, and read scoped to one workspace with the newest first.
 */

import { afterEach, describe, expect, it, vi } from "vitest";

import { fakePrisma } from "../test-support/fake-prisma";
import { listEntries, record } from "./audit";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("record", () => {
  it("writes the entry it was given", async () => {
    const db = fakePrisma({ "auditLog.create": { id: "a_1" } });
    const landed = await record(db.client, {
      workspaceId: "ws_1",
      actorId: "user_1",
      action: "member.role_changed",
      resourceType: "membership",
      resourceId: "m_1",
      metadata: { from: "MEMBER", to: "ADMIN" },
    });

    expect(landed).toBe(true);
    expect(db.only().args.data).toMatchObject({
      workspaceId: "ws_1",
      actorId: "user_1",
      action: "member.role_changed",
      resourceId: "m_1",
    });
  });

  it("does not throw when the log is unreachable", async () => {
    // The caller's work is already done by the time this runs. Letting the
    // failure out would turn a gap in the log into a role change that appeared
    // to fail while having taken effect, which is the worse of the two.
    vi.spyOn(console, "error").mockImplementation(() => {});
    const db = {
      auditLog: {
        create: () => Promise.reject(new Error("database is down")),
      },
    } as unknown as Parameters<typeof record>[0];

    await expect(
      record(db, {
        workspaceId: "ws_1",
        actorId: null,
        action: "member.removed",
        resourceType: "membership",
        resourceId: "m_1",
      }),
    ).resolves.toBe(false);
  });
});

describe("listEntries", () => {
  it("reads one workspace, newest first, and capped", async () => {
    const db = fakePrisma({ "auditLog.findMany": [] });
    await listEntries(db.client, "ws_1");

    const call = db.only();
    expect(call.args.where).toEqual({ workspaceId: "ws_1" });
    expect(call.args.orderBy).toEqual({ createdAt: "desc" });
    // Uncapped, a busy workspace would render a year of rows into one page.
    expect(call.args.take).toBe(100);
  });

  it("brings the actor, who is optional because people can be deleted", async () => {
    const db = fakePrisma({ "auditLog.findMany": [] });
    await listEntries(db.client, "ws_1", 10);

    expect(db.only().args.select).toMatchObject({
      action: true,
      resourceId: true,
      actor: { select: { id: true, name: true, email: true } },
    });
    expect(db.only().args.take).toBe(10);
  });
});
