/**
 * The project action, against a fake client and a fake membership row.
 *
 * What is worth proving here is not that a row gets written. It is that the
 * write is reached only by someone authorize() says may reach it, that a
 * refusal writes nothing at all, and that a stranger cannot tell a workspace
 * they are not in from one that is not there.
 */

import type { PrismaClient } from "@prisma/client";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { Role } from "../authorize";
import { fakePrisma, type FakePrisma } from "../test-support/fake-prisma";
import { IDLE, NO_WORKSPACE, SIGNED_OUT } from "./form";
// Imported here although the mocks below are what it will find: vitest hoists
// vi.mock above the imports, so source order is not the order that runs.
import { createProject } from "./projects";

const context = vi.hoisted(() => ({
  db: undefined as unknown,
  session: undefined as unknown,
}));

// Getters, not values: the fake is replaced per test and the action reads the
// client when it runs, not when this module is first imported.
vi.mock("../db", () => ({
  get prisma() {
    return context.db;
  },
}));

vi.mock("../../auth", () => ({
  auth: () => Promise.resolve(context.session),
}));

vi.mock("next/cache", () => ({
  revalidatePath: () => undefined,
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

const CREATED = { id: "proj_new", workspaceId: ACME.id, name: "Parser" };

function arrange(
  role: Role | null,
  options: { workspaceExists?: boolean } = {},
): FakePrisma {
  const db = fakePrisma({
    "workspace.findUnique": options.workspaceExists === false ? null : ACME,
    "membership.findUnique": role === null ? null : { role },
    "project.create": CREATED,
  });
  context.db = db.client;
  context.session = { user: { id: ALICE } };
  return db;
}

function form(fields: Record<string, string>): FormData {
  const data = new FormData();
  for (const [name, value] of Object.entries(fields)) data.append(name, value);
  return data;
}

const GOOD = { workspace: "acme", name: "Parser", description: "The front end." };

function writes(db: FakePrisma): number {
  return db.calls.filter((call) => call.method === "create").length;
}

beforeEach(() => {
  context.db = undefined;
  context.session = undefined;
});

describe("createProject", () => {
  it("lets a MEMBER create one", async () => {
    const db = arrange("MEMBER");
    const result = await createProject(IDLE, form(GOOD));

    expect(result).toEqual({ error: null, createdId: "proj_new" });
    const create = db.calls.find((call) => call.method === "create");
    expect(create?.model).toBe("project");
    expect(create?.args.data).toEqual({
      workspaceId: ACME.id,
      name: "Parser",
      description: "The front end.",
    });
  });

  it("files it under the workspace the slug resolved to, not one the form named", async () => {
    // The form carries a slug and nothing else about the workspace. A hidden
    // field holding an id would be a field worth forging.
    const db = arrange("MEMBER");
    await createProject(IDLE, form({ ...GOOD, workspaceId: "ws_somewhere_else" }));

    const create = db.calls.find((call) => call.method === "create");
    expect((create?.args.data as { workspaceId: string }).workspaceId).toBe(ACME.id);
  });

  it("refuses a VIEWER and writes nothing", async () => {
    const db = arrange("VIEWER");
    const result = await createProject(IDLE, form(GOOD));

    expect(result.createdId).toBeNull();
    expect(result.error).toBe(
      "Your role in this workspace does not allow creating projects.",
    );
    expect(writes(db)).toBe(0);
  });

  it.each(["MEMBER", "ADMIN", "OWNER"] as const)("lets a %s through", async (role) => {
    const db = arrange(role);
    expect((await createProject(IDLE, form(GOOD))).error).toBeNull();
    expect(writes(db)).toBe(1);
  });

  it("tells a non-member the workspace does not exist", async () => {
    const db = arrange(null);
    const result = await createProject(IDLE, form(GOOD));

    expect(result.error).toBe(NO_WORKSPACE);
    expect(writes(db)).toBe(0);
  });

  it("says the same thing about a workspace that really does not exist", async () => {
    // The two answers have to be one answer. Anything else turns the form into
    // a way of listing which workspaces are out there.
    const db = arrange("OWNER", { workspaceExists: false });
    const result = await createProject(IDLE, form({ ...GOOD, workspace: "nothing" }));

    expect(result.error).toBe(NO_WORKSPACE);
    expect(writes(db)).toBe(0);
  });

  it("does not touch the database when nobody is signed in", async () => {
    const db = arrange("OWNER");
    context.session = null;

    expect(await createProject(IDLE, form(GOOD))).toEqual({
      error: SIGNED_OUT,
      createdId: null,
    });
    expect(db.calls).toHaveLength(0);
  });

  it("wants a name", async () => {
    const db = arrange("MEMBER");
    const result = await createProject(IDLE, form({ ...GOOD, name: "   " }));

    expect(result.error).toBe("A project needs a name.");
    expect(db.calls).toHaveLength(0);
  });

  it("turns down a name too long to store", async () => {
    const db = arrange("MEMBER");
    const result = await createProject(IDLE, form({ ...GOOD, name: "x".repeat(81) }));

    expect(result.error).toContain("at most 80");
    expect(writes(db)).toBe(0);
  });

  it("stores an empty description as nothing rather than as an empty string", async () => {
    const db = arrange("MEMBER");
    await createProject(IDLE, form({ ...GOOD, description: "" }));

    const create = db.calls.find((call) => call.method === "create");
    expect((create?.args.data as { description: string | null }).description).toBeNull();
  });

  it("reports a name already taken instead of failing the request", async () => {
    const db = arrange("MEMBER");
    const duplicate = Object.assign(new Error("unique constraint"), { code: "P2002" });
    // Only the insert misbehaves. Everything the action does before it still
    // has to run, or this would be a test of the validation above.
    context.db = new Proxy(db.client, {
      get(target, name) {
        if (name === "project") return { create: () => Promise.reject(duplicate) };
        return Reflect.get(target, name);
      },
    }) as PrismaClient;

    expect(await createProject(IDLE, form(GOOD))).toEqual({
      error: "A project with that name already exists here.",
      createdId: null,
    });
  });

  it("lets a failure that is not a duplicate name through", async () => {
    const db = arrange("MEMBER");
    const broken = new Error("connection reset");
    context.db = new Proxy(db.client, {
      get(target, name) {
        if (name === "project") return { create: () => Promise.reject(broken) };
        return Reflect.get(target, name);
      },
    }) as PrismaClient;

    await expect(createProject(IDLE, form(GOOD))).rejects.toThrow("connection reset");
  });
});
