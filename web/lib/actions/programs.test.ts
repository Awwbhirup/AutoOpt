/**
 * The program action, against a fake client and a fake membership row.
 *
 * Beyond the role check this has a second thing to get right: the project id is
 * a form field, so a member of one workspace must not be able to hang a program
 * off a project in another.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

import type { Role } from "../authorize";
import { fakePrisma, type FakePrisma } from "../test-support/fake-prisma";
import { IDLE, NO_WORKSPACE, SIGNED_OUT } from "./form";
// Imported here although the mocks below are what it will find: vitest hoists
// vi.mock above the imports, so source order is not the order that runs.
import { createProgram } from "./programs";

const context = vi.hoisted(() => ({
  db: undefined as unknown,
  session: undefined as unknown,
}));

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

const PROJECT = { id: "proj_1", workspaceId: ACME.id, name: "Front end" };
const CREATED = { id: "prog_new", projectId: PROJECT.id, name: "Loop sample" };

const SOURCE = "input x;\nint a = 2 + 3;\nprint(a + x);\n";

function arrange(
  role: Role | null,
  options: { project?: unknown } = {},
): FakePrisma {
  const db = fakePrisma({
    "workspace.findUnique": ACME,
    "membership.findUnique": role === null ? null : { role },
    "project.findUnique": "project" in options ? options.project : PROJECT,
    "program.create": CREATED,
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

const GOOD = {
  workspace: "acme",
  projectId: PROJECT.id,
  name: "Loop sample",
  source: SOURCE,
  category: "loops",
};

function writes(db: FakePrisma): number {
  return db.calls.filter((call) => call.method === "create").length;
}

beforeEach(() => {
  context.db = undefined;
  context.session = undefined;
});

describe("createProgram", () => {
  it("lets a MEMBER add one, crediting them as the author", async () => {
    const db = arrange("MEMBER");
    const result = await createProgram(IDLE, form(GOOD));

    expect(result).toEqual({ error: null, createdId: "prog_new" });
    const create = db.calls.find((call) => call.method === "create");
    expect(create?.model).toBe("program");
    expect(create?.args.data).toEqual({
      projectId: PROJECT.id,
      authorId: ALICE,
      name: "Loop sample",
      // Trimmed: a paste usually arrives with a blank line on the end.
      source: SOURCE.trim(),
      category: "loops",
    });
  });

  it("refuses a VIEWER and writes nothing", async () => {
    const db = arrange("VIEWER");
    const result = await createProgram(IDLE, form(GOOD));

    expect(result.createdId).toBeNull();
    expect(result.error).toBe(
      "Your role in this workspace does not allow adding programs.",
    );
    expect(writes(db)).toBe(0);
  });

  it("does not even look the project up for a VIEWER", async () => {
    // The refusal comes before the lookup, so the form cannot be used to find
    // out which project ids are real.
    const db = arrange("VIEWER");
    await createProgram(IDLE, form(GOOD));

    expect(db.calls.some((call) => call.model === "project")).toBe(false);
  });

  it.each(["MEMBER", "ADMIN", "OWNER"] as const)("lets a %s through", async (role) => {
    const db = arrange(role);
    expect((await createProgram(IDLE, form(GOOD))).error).toBeNull();
    expect(writes(db)).toBe(1);
  });

  it("tells a non-member the workspace does not exist", async () => {
    const db = arrange(null);
    const result = await createProgram(IDLE, form(GOOD));

    expect(result.error).toBe(NO_WORKSPACE);
    expect(writes(db)).toBe(0);
  });

  it("refuses a project in another workspace", async () => {
    // The tenancy boundary. Being a MEMBER here says nothing about there.
    const db = arrange("OWNER", {
      project: { id: "proj_x", workspaceId: "ws_other", name: "Theirs" },
    });
    const result = await createProgram(IDLE, form({ ...GOOD, projectId: "proj_x" }));

    expect(result.error).toBe("That project does not exist.");
    expect(writes(db)).toBe(0);
  });

  it("says the same thing about a project that is not there at all", async () => {
    const db = arrange("OWNER", { project: null });
    const result = await createProgram(IDLE, form({ ...GOOD, projectId: "proj_x" }));

    expect(result.error).toBe("That project does not exist.");
    expect(writes(db)).toBe(0);
  });

  it("does not touch the database when nobody is signed in", async () => {
    const db = arrange("OWNER");
    context.session = null;

    expect(await createProgram(IDLE, form(GOOD))).toEqual({
      error: SIGNED_OUT,
      createdId: null,
    });
    expect(db.calls).toHaveLength(0);
  });

  it("wants source, not just a name", async () => {
    const db = arrange("MEMBER");
    const result = await createProgram(IDLE, form({ ...GOOD, source: "  \n " }));

    expect(result.error).toBe("Paste the program source.");
    expect(db.calls).toHaveLength(0);
  });

  it("turns down a paste too long to store", async () => {
    const db = arrange("MEMBER");
    const result = await createProgram(
      IDLE,
      form({ ...GOOD, source: "x".repeat(100_001) }),
    );

    expect(result.error).toBe("That source is too long to store.");
    expect(writes(db)).toBe(0);
  });

  it("files a category the engine does not have under mixed", async () => {
    const db = arrange("MEMBER");
    await createProgram(IDLE, form({ ...GOOD, category: "whatever" }));

    const create = db.calls.find((call) => call.method === "create");
    expect((create?.args.data as { category: string }).category).toBe("mixed");
  });
});
