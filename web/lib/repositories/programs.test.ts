import { describe, expect, it } from "vitest";

import { fakePrisma } from "../test-support/fake-prisma";
import {
  createProgram,
  findProgram,
  listPrograms,
  listProgramsInWorkspace,
} from "./programs";

describe("listPrograms", () => {
  it("scopes to one project, most recently touched first", async () => {
    const db = fakePrisma({ "program.findMany": [] });
    await listPrograms(db.client, "proj_1");

    const call = db.only();
    expect(call.model).toBe("program");
    expect(call.method).toBe("findMany");
    expect(call.args.where).toEqual({ projectId: "proj_1" });
    expect(call.args.orderBy).toEqual({ updatedAt: "desc" });
  });

  it("leaves the program body out of the list", async () => {
    const db = fakePrisma({ "program.findMany": [] });
    await listPrograms(db.client, "proj_1");

    const select = db.only().args.select as Record<string, unknown>;
    expect(select.source).toBeUndefined();
    expect(select.name).toBe(true);
    expect(select._count).toEqual({ select: { runs: true } });
  });
});

describe("listProgramsInWorkspace", () => {
  it("reaches the workspace through the project", async () => {
    const db = fakePrisma({ "program.findMany": [] });
    await listProgramsInWorkspace(db.client, "ws_1");

    const call = db.only();
    expect(call.args.where).toEqual({ project: { workspaceId: "ws_1" } });
  });

  it("orders by project first, so the caller can group without sorting", async () => {
    const db = fakePrisma({ "program.findMany": [] });
    await listProgramsInWorkspace(db.client, "ws_1");

    expect(db.only().args.orderBy).toEqual([
      { project: { name: "asc" } },
      { updatedAt: "desc" },
    ]);
  });
});

describe("findProgram", () => {
  it("carries the body, which the list leaves out", async () => {
    const db = fakePrisma({ "program.findUnique": null });
    await findProgram(db.client, "prog_1");

    const call = db.only();
    expect(call.args.where).toEqual({ id: "prog_1" });
    expect((call.args.select as Record<string, unknown>).source).toBe(true);
  });

  it("carries the workspace, for the caller to check the id against", async () => {
    const db = fakePrisma({ "program.findUnique": null });
    await findProgram(db.client, "prog_1");

    expect(db.only().args.select).toMatchObject({
      project: { select: { workspaceId: true } },
    });
  });
});

describe("createProgram", () => {
  it("writes the source and the author with it", async () => {
    const db = fakePrisma({ "program.create": { id: "prog_1" } });
    await createProgram(db.client, {
      projectId: "proj_1",
      authorId: "user_1",
      name: "Loop sample",
      source: "input x;\n",
      category: "loops",
    });

    const call = db.only();
    expect(call.method).toBe("create");
    expect(call.args.data).toEqual({
      projectId: "proj_1",
      authorId: "user_1",
      name: "Loop sample",
      source: "input x;\n",
      category: "loops",
    });
  });

  it("leaves the engine's feature counts unset", async () => {
    const db = fakePrisma({ "program.create": { id: "prog_1" } });
    await createProgram(db.client, {
      projectId: "proj_1",
      authorId: "user_1",
      name: "Loop sample",
      source: "input x;\n",
      category: "loops",
    });

    expect((db.only().args.data as Record<string, unknown>).features).toBeUndefined();
  });
});
