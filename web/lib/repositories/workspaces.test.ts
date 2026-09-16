/**
 * The queries, not the database. Each case asserts the part of the query that
 * would be a bug if it changed: the where clause that scopes rows to one
 * tenant, and the ordering the page relies on.
 */

import { describe, expect, it } from "vitest";

import { fakePrisma } from "../test-support/fake-prisma";
import { findQuota, findWorkspaceBySlug, listWorkspacesForUser } from "./workspaces";

describe("listWorkspacesForUser", () => {
  it("asks Membership for one user, ordered by workspace name", async () => {
    const db = fakePrisma({ "membership.findMany": [] });
    await listWorkspacesForUser(db.client, "user_1");

    const call = db.only();
    expect(call.model).toBe("membership");
    expect(call.method).toBe("findMany");
    expect(call.args.where).toEqual({ userId: "user_1" });
    expect(call.args.orderBy).toEqual({ workspace: { name: "asc" } });
  });

  it("selects the role alongside the workspace", async () => {
    const db = fakePrisma({ "membership.findMany": [] });
    await listWorkspacesForUser(db.client, "user_1");

    expect(db.only().args.select).toMatchObject({
      role: true,
      workspace: { select: { id: true, name: true, slug: true } },
    });
  });
});

describe("findWorkspaceBySlug", () => {
  const row = {
    id: "ws_1",
    name: "Acme Lab",
    slug: "acme-lab",
    createdAt: new Date(0),
    updatedAt: new Date(0),
    memberships: [
      {
        id: "m_1",
        userId: "user_1",
        role: "ADMIN",
        createdAt: new Date(0),
      },
    ],
  };

  it("looks the workspace up by slug and the membership by user", async () => {
    const db = fakePrisma({ "workspace.findUnique": row });
    await findWorkspaceBySlug(db.client, "acme-lab", "user_1");

    const call = db.only();
    expect(call.model).toBe("workspace");
    expect(call.method).toBe("findUnique");
    expect(call.args.where).toEqual({ slug: "acme-lab" });
    expect(call.args.select).toMatchObject({
      memberships: { where: { userId: "user_1" } },
    });
  });

  it("flattens the caller's membership out of the array", async () => {
    const db = fakePrisma({ "workspace.findUnique": row });
    const workspace = await findWorkspaceBySlug(
      db.client,
      "acme-lab",
      "user_1",
    );

    expect(workspace?.membership?.role).toBe("ADMIN");
    expect(workspace).not.toHaveProperty("memberships");
  });

  it("reports a non-member as a null membership, not a missing workspace", async () => {
    const db = fakePrisma({
      "workspace.findUnique": { ...row, memberships: [] },
    });
    const workspace = await findWorkspaceBySlug(
      db.client,
      "acme-lab",
      "user_2",
    );

    expect(workspace?.slug).toBe("acme-lab");
    expect(workspace?.membership).toBeNull();
  });

  it("returns null when there is no such slug", async () => {
    const db = fakePrisma({ "workspace.findUnique": null });
    expect(
      await findWorkspaceBySlug(db.client, "nope", "user_1"),
    ).toBeNull();
  });
});

describe("findQuota", () => {
  it("reads the one row by the workspace it belongs to", async () => {
    const db = fakePrisma({ "quota.findUnique": null });
    await findQuota(db.client, "ws_1");

    const call = db.only();
    expect(call.model).toBe("quota");
    expect(call.method).toBe("findUnique");
    expect(call.args.where).toEqual({ workspaceId: "ws_1" });
  });

  it("reports no row rather than a quota of zero", async () => {
    const db = fakePrisma({ "quota.findUnique": null });
    expect(await findQuota(db.client, "ws_1")).toBeNull();
  });
});
