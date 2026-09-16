/**
 * The queries, and the one rule that lives with them.
 *
 * wouldOrphanWorkspace is tested harder than the reads are, because it is the
 * only thing standing between an ordinary admin action and a workspace nobody
 * can administer. There is no route back from that through the application.
 */

import { describe, expect, it } from "vitest";

import { fakePrisma } from "../test-support/fake-prisma";
import {
  addMember,
  countOwners,
  findMember,
  findUserByEmail,
  listMembers,
  removeMember,
  setMemberRole,
  wouldOrphanWorkspace,
} from "./members";

describe("listMembers", () => {
  it("asks for one workspace's memberships, owners first", async () => {
    const db = fakePrisma({ "membership.findMany": [] });
    await listMembers(db.client, "ws_1");

    const call = db.only();
    expect(call.model).toBe("membership");
    expect(call.args.where).toEqual({ workspaceId: "ws_1" });
    // Role ascending is owner first, because Role is declared in that order.
    expect(call.args.orderBy).toEqual([{ role: "asc" }, { createdAt: "asc" }]);
  });

  it("brings the person along, so the list is readable without a second query", async () => {
    const db = fakePrisma({ "membership.findMany": [] });
    await listMembers(db.client, "ws_1");

    expect(db.only().args.select).toMatchObject({
      role: true,
      userId: true,
      user: { select: { id: true, name: true, email: true, image: true } },
    });
  });
});

describe("findMember", () => {
  it("goes through the composite unique, not a scan", async () => {
    const db = fakePrisma();
    await findMember(db.client, "ws_1", "user_1");

    expect(db.only().args.where).toEqual({
      userId_workspaceId: { userId: "user_1", workspaceId: "ws_1" },
    });
  });
});

describe("findUserByEmail", () => {
  it("does not select the password hash", async () => {
    const db = fakePrisma();
    await findUserByEmail(db.client, "someone@example.com");

    const select = db.only().args.select as Record<string, unknown>;
    expect(select).not.toHaveProperty("passwordHash");
    expect(select).toMatchObject({ id: true, email: true });
  });
});

describe("countOwners", () => {
  it("counts owners of one workspace only", async () => {
    const db = fakePrisma({ "membership.count": 2 });
    await countOwners(db.client, "ws_1");

    expect(db.only().args.where).toEqual({ workspaceId: "ws_1", role: "OWNER" });
  });
});

describe("wouldOrphanWorkspace", () => {
  it("is false for anyone who is not an owner", async () => {
    const db = fakePrisma({ "membership.count": 1 });

    expect(await wouldOrphanWorkspace(db.client, "ws_1", { role: "ADMIN" }, null)).toBe(
      false,
    );
    // Not even counted: a non-owner leaving cannot change how many owners there are.
    expect(db.calls).toHaveLength(0);
  });

  it("is true when the last owner is removed", async () => {
    const db = fakePrisma({ "membership.count": 1 });
    expect(await wouldOrphanWorkspace(db.client, "ws_1", { role: "OWNER" }, null)).toBe(
      true,
    );
  });

  it("is true when the last owner is demoted", async () => {
    const db = fakePrisma({ "membership.count": 1 });
    expect(
      await wouldOrphanWorkspace(db.client, "ws_1", { role: "OWNER" }, "ADMIN"),
    ).toBe(true);
  });

  it("is false when another owner remains", async () => {
    const db = fakePrisma({ "membership.count": 2 });
    expect(await wouldOrphanWorkspace(db.client, "ws_1", { role: "OWNER" }, null)).toBe(
      false,
    );
  });

  it("is false for an owner staying an owner", async () => {
    const db = fakePrisma({ "membership.count": 1 });
    // A no-op change must not be refused as though it removed the last owner.
    expect(
      await wouldOrphanWorkspace(db.client, "ws_1", { role: "OWNER" }, "OWNER"),
    ).toBe(false);
  });
});

describe("writes", () => {
  it("creates a membership with the role it was given", async () => {
    const db = fakePrisma({ "membership.create": { id: "m_1" } });
    await addMember(db.client, { workspaceId: "ws_1", userId: "user_1", role: "VIEWER" });

    expect(db.only().args.data).toEqual({
      workspaceId: "ws_1",
      userId: "user_1",
      role: "VIEWER",
    });
  });

  it("updates and deletes through the composite unique, so neither can hit two rows", async () => {
    const where = { userId_workspaceId: { userId: "user_1", workspaceId: "ws_1" } };

    const update = fakePrisma({ "membership.update": { id: "m_1" } });
    await setMemberRole(update.client, {
      workspaceId: "ws_1",
      userId: "user_1",
      role: "ADMIN",
    });
    expect(update.only().args.where).toEqual(where);
    expect(update.only().args.data).toEqual({ role: "ADMIN" });

    const remove = fakePrisma({ "membership.delete": { id: "m_1" } });
    await removeMember(remove.client, { workspaceId: "ws_1", userId: "user_1" });
    expect(remove.only().args.where).toEqual(where);
  });
});
