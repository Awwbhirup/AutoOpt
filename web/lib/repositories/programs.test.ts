import { describe, expect, it } from "vitest";

import { fakePrisma } from "../test-support/fake-prisma";
import { listPrograms } from "./programs";

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
