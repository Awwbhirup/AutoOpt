/**
 * The rule the signed-in shell rests on: a workspace you are not in looks
 * exactly like a workspace that is not there.
 *
 * Tested through resolveWorkspace rather than through the page wrapper, because
 * what is worth pinning down is the answer, not which of notFound or redirect
 * the framework is asked to throw.
 */

import { describe, expect, it, vi } from "vitest";

import { fakePrisma } from "./test-support/fake-prisma";
import { resolveWorkspace } from "./workspace";

vi.mock("../auth", () => ({ auth: () => Promise.resolve(null) }));
vi.mock("./db", () => ({ prisma: undefined }));
vi.mock("next/navigation", () => ({
  notFound: () => undefined,
  redirect: () => undefined,
}));

const ALICE = "user_alice";

const ACME = {
  id: "ws_acme",
  name: "Acme",
  slug: "acme",
  createdAt: new Date("2026-01-01T00:00:00.000Z"),
  updatedAt: new Date("2026-01-01T00:00:00.000Z"),
  memberships: [],
};

function store(options: { workspace?: unknown; role?: string | null } = {}) {
  return fakePrisma({
    "workspace.findUnique": "workspace" in options ? options.workspace : ACME,
    "membership.findUnique": options.role ? { role: options.role } : null,
  });
}

describe("resolveWorkspace", () => {
  it("gives a member the workspace and the role to authorize with", async () => {
    const db = store({ role: "MEMBER" });
    const access = await resolveWorkspace(db.client, ALICE, "acme");

    expect(access?.workspace.id).toBe(ACME.id);
    expect(access?.role).toBe("MEMBER");
    expect(access?.principal).toEqual({ userId: ALICE, role: "MEMBER" });
  });

  it("refuses a workspace that does not exist", async () => {
    const db = store({ workspace: null });
    expect(await resolveWorkspace(db.client, ALICE, "nothing")).toBeNull();
  });

  it("refuses a non-member the same way, so the two cannot be told apart", async () => {
    const db = store({ role: null });
    expect(await resolveWorkspace(db.client, ALICE, "acme")).toBeNull();
  });

  it("asks for the membership by the user in the session and the workspace found", async () => {
    // Not by the slug and not by anything the caller passed in beside it: the
    // role has to be the one this user holds in this workspace.
    const db = store({ role: "ADMIN" });
    await resolveWorkspace(db.client, ALICE, "acme");

    const membership = db.calls.find((call) => call.model === "membership");
    expect(membership?.args.where).toEqual({
      userId_workspaceId: { userId: ALICE, workspaceId: ACME.id },
    });
  });
});
