/**
 * The two pieces of the sign-in path that are decisions rather than plumbing:
 * what the sign-up form is allowed to send, and what the first sign-in writes.
 *
 * The module is a "use server" one, so importing it would otherwise build a
 * Prisma client and pull Auth.js in through its Next runtime, for functions
 * that touch neither. Both are stubbed out here; what is under test takes its
 * database as an argument.
 */

import { describe, expect, it, vi } from "vitest";

import { fakePrisma } from "../test-support/fake-prisma";

vi.mock("../db", () => ({ prisma: {} }));
vi.mock("../../auth", () => ({ signIn: async () => undefined }));
vi.mock("next-auth", () => ({ AuthError: class AuthError extends Error {} }));

const { ensureWorkspaceForUser, signInWithPassword, signUp, validateSignUp } =
  await import("./auth");

const GOOD = {
  name: "Abhirup Banik",
  email: "abhirup@example.com",
  password: "correct horse battery",
};

async function fieldErrors(input: Record<string, unknown>) {
  const checked = await validateSignUp(input);
  if (checked.ok) throw new Error("expected the input to be refused");
  return checked.fieldErrors;
}

async function accepted(input: Record<string, unknown>) {
  const checked = await validateSignUp(input);
  if (!checked.ok) {
    throw new Error(`expected the input to pass: ${JSON.stringify(checked.fieldErrors)}`);
  }
  return checked.value;
}

describe("validateSignUp", () => {
  it("accepts a filled form", async () => {
    expect(await accepted(GOOD)).toEqual(GOOD);
  });

  it("trims the name and the address", async () => {
    const value = await accepted({
      ...GOOD,
      name: "  Abhirup Banik  ",
      email: "  abhirup@example.com  ",
    });
    expect(value.name).toBe("Abhirup Banik");
    expect(value.email).toBe("abhirup@example.com");
  });

  it("keeps the address as typed, because sign-in reads the column as stored", async () => {
    const value = await accepted({ ...GOOD, email: "Abhirup@Example.com" });
    expect(value.email).toBe("Abhirup@Example.com");
  });

  it("turns an omitted name into null rather than an empty string", async () => {
    expect((await accepted({ ...GOOD, name: "" })).name).toBeNull();
    expect((await accepted({ ...GOOD, name: "   " })).name).toBeNull();
  });

  it("refuses something that is not an address", async () => {
    for (const email of ["abhirup", "abhirup@", "@example.com", "a b@c.com", ""]) {
      expect(await fieldErrors({ ...GOOD, email })).toHaveProperty("email");
    }
  });

  it("refuses an address longer than the standard allows", async () => {
    const email = `${"a".repeat(250)}@example.com`;
    expect(await fieldErrors({ ...GOOD, email })).toHaveProperty("email");
  });

  it("refuses a short password", async () => {
    const errors = await fieldErrors({ ...GOOD, password: "short" });
    expect(errors.password).toMatch(/10/);
    expect(errors.email).toBeUndefined();
  });

  it("measures the password in bytes, which is what bcrypt stops at", async () => {
    // 36 two-byte characters is exactly the limit, 37 is one over it. Counted
    // as characters both would pass, and the second could then only ever match
    // by being truncated.
    expect(await accepted({ ...GOOD, password: "\u00e9".repeat(36) })).toBeTruthy();
    expect(
      await fieldErrors({ ...GOOD, password: "\u00e9".repeat(37) }),
    ).toHaveProperty("password");
  });

  it("refuses an over-long name", async () => {
    expect(await fieldErrors({ ...GOOD, name: "n".repeat(81) })).toHaveProperty("name");
  });

  it("reports every bad field at once, so the form is not fixed one round at a time", async () => {
    const errors = await fieldErrors({ name: "n".repeat(81), email: "nope", password: "x" });
    expect(Object.keys(errors).sort()).toEqual(["email", "name", "password"]);
  });

  it("refuses input that is not a form at all", async () => {
    expect((await validateSignUp(null)).ok).toBe(false);
    expect((await validateSignUp({})).ok).toBe(false);
    expect((await validateSignUp({ email: 1, password: 2, name: 3 })).ok).toBe(false);
  });
});

const EMPTY = { error: null, fieldErrors: {}, values: { name: "", email: "" } };

describe("the forms keep what was typed", () => {
  it("hands the name and the address back after a refused sign-up", async () => {
    const form = new FormData();
    form.set("name", "Abhirup Banik");
    form.set("email", "not-an-address");
    form.set("password", "hunter2");

    const state = await signUp(EMPTY, form);

    expect(state.values).toEqual({ name: "Abhirup Banik", email: "not-an-address" });
    expect(state.fieldErrors.email).toBeDefined();
    expect(state.fieldErrors.password).toBeDefined();
    // The one thing that must not come back down the wire.
    expect(JSON.stringify(state)).not.toContain("hunter2");
  });

  it("hands the address back after a refused sign-in", async () => {
    const form = new FormData();
    form.set("email", "abhirup@example.com");
    // Empty, so this is refused before Auth.js or the database is reached.
    form.set("password", "");

    const state = await signInWithPassword(EMPTY, form);

    expect(state.error).toBe("That email and password do not match an account.");
    expect(state.values).toEqual({ name: "", email: "abhirup@example.com" });
  });
});

const USER = { id: "user_1", email: "abhirup.banik@example.com" };

describe("ensureWorkspaceForUser", () => {
  it("looks for any membership, not for an owned workspace", async () => {
    const db = fakePrisma({ "workspace.create": { id: "ws_1" } });
    await ensureWorkspaceForUser(db.client, USER);

    const first = db.calls[0];
    expect(first.model).toBe("membership");
    expect(first.method).toBe("findFirst");
    expect(first.args.where).toEqual({ userId: "user_1" });
  });

  it("creates the workspace, the OWNER membership and the quota in one write", async () => {
    const db = fakePrisma({ "workspace.create": { id: "ws_1" } });
    const result = await ensureWorkspaceForUser(db.client, USER);

    expect(result).toEqual({ workspaceId: "ws_1", created: true });

    const create = db.calls.find((call) => call.method === "create");
    expect(create?.model).toBe("workspace");
    expect(create?.args.data).toEqual({
      name: "Abhirup Banik",
      slug: "abhirup-banik",
      memberships: { create: { userId: "user_1", role: "OWNER" } },
      quota: { create: {} },
    });
  });

  it("names the workspace from the address", async () => {
    const cases: [string, string, string][] = [
      ["abhirup@example.com", "Abhirup", "abhirup"],
      ["abhirup.banik@example.com", "Abhirup Banik", "abhirup-banik"],
      ["first_last@example.com", "First Last", "first-last"],
      ["abhirup+autoopt@example.com", "Abhirup", "abhirup"],
      ["...@example.com", "Workspace", "workspace"],
    ];

    for (const [email, name, slug] of cases) {
      const db = fakePrisma({ "workspace.create": { id: "ws_1" } });
      await ensureWorkspaceForUser(db.client, { id: "user_1", email });

      const create = db.calls.find((call) => call.method === "create");
      expect(create?.args.data).toMatchObject({ name, slug });
    }
  });

  it("offers the slug candidates to the workspace table, in order", async () => {
    const db = fakePrisma({
      "workspace.findUnique": { id: "ws_other" },
      "workspace.create": { id: "ws_1" },
    });
    // Every candidate comes back taken, so this ends in the exhaustion path.
    // That uniqueSlug stops at the first free one is slug.test.ts's business;
    // what is checked here is that the predicate asks the right question.
    await ensureWorkspaceForUser(db.client, USER).catch(() => undefined);

    const asked = db.calls
      .filter((call) => call.model === "workspace" && call.method === "findUnique")
      .map((call) => (call.args.where as { slug: string }).slug);

    expect(asked.slice(0, 3)).toEqual([
      "abhirup-banik",
      "abhirup-banik-2",
      "abhirup-banik-3",
    ]);
  });

  it("writes nothing when the user is already a member of something", async () => {
    const db = fakePrisma({ "membership.findFirst": { workspaceId: "ws_9" } });
    const result = await ensureWorkspaceForUser(db.client, USER);

    expect(result).toEqual({ workspaceId: "ws_9", created: false });
    expect(db.only().method).toBe("findFirst");
  });

  it("is idempotent: the second sign-in makes no second workspace", async () => {
    const results: Record<string, unknown> = { "workspace.create": { id: "ws_1" } };
    const db = fakePrisma(results);

    const first = await ensureWorkspaceForUser(db.client, USER);
    expect(first).toEqual({ workspaceId: "ws_1", created: true });

    // The row the create just wrote, as the next sign-in would find it.
    results["membership.findFirst"] = { workspaceId: first.workspaceId };

    const second = await ensureWorkspaceForUser(db.client, USER);
    expect(second).toEqual({ workspaceId: "ws_1", created: false });

    expect(db.calls.filter((call) => call.method === "create")).toHaveLength(1);
  });
});
