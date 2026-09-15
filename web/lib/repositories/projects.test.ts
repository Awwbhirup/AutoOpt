import { describe, expect, it } from "vitest";

import { fakePrisma } from "../test-support/fake-prisma";
import { listProjects } from "./projects";

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
