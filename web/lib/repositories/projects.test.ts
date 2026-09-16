import { describe, expect, it } from "vitest";

import { fakePrisma } from "../test-support/fake-prisma";
import { createProject, findProject, listProjects } from "./projects";

describe("listProjects", () => {
  it("scopes to one workspace and orders by name", async () => {
    const db = fakePrisma({ "project.findMany": [] });
    await listProjects(db.client, "ws_1");

    const call = db.only();
    expect(call.model).toBe("project");
    expect(call.method).toBe("findMany");
    expect(call.args.where).toEqual({ workspaceId: "ws_1" });
    expect(call.args.orderBy).toEqual({ name: "asc" });
  });

  it("counts programs instead of loading them", async () => {
    const db = fakePrisma({ "project.findMany": [] });
    await listProjects(db.client, "ws_1");

    const select = db.only().args.select as Record<string, unknown>;
    expect(select._count).toEqual({ select: { programs: true } });
    expect(select.programs).toBeUndefined();
  });
});

describe("findProject", () => {
  it("looks one up by id and carries the workspace it is in", async () => {
    const db = fakePrisma({ "project.findUnique": null });
    await findProject(db.client, "proj_1");

    const call = db.only();
    expect(call.method).toBe("findUnique");
    expect(call.args.where).toEqual({ id: "proj_1" });
    expect(call.args.select).toMatchObject({ workspaceId: true });
  });
});

describe("createProject", () => {
  it("writes the row and hands back enough to check it", async () => {
    const db = fakePrisma({ "project.create": { id: "proj_1" } });
    await createProject(db.client, {
      workspaceId: "ws_1",
      name: "Front end",
      description: null,
    });

    const call = db.only();
    expect(call.method).toBe("create");
    expect(call.args.data).toEqual({
      workspaceId: "ws_1",
      name: "Front end",
      description: null,
    });
    expect(call.args.select).toMatchObject({ workspaceId: true });
  });
});
