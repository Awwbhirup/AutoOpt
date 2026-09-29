import { randomUUID } from "node:crypto";

import { PrismaClient } from "@prisma/client";
import { describe, expect, it } from "vitest";

import { consumeKeyRequest } from "./rate-limit";

describe.runIf(process.env.RUN_DB_TESTS === "1")("key rate window in Postgres", () => {
  it("allows only one of concurrent requests for the last slot", async () => {
    const db = new PrismaClient();
    const workspace = await db.workspace.create({
      data: { name: "Rate test", slug: `rate-test-${randomUUID()}` },
      select: { id: true },
    });
    try {
      const key = await db.apiKey.create({
        data: {
          workspaceId: workspace.id,
          name: "Race test",
          hash: randomUUID().replaceAll("-", ""),
          prefix: "ao_test",
          scopes: ["runs:read"],
          requestsPerMinute: 1,
        },
        select: { id: true },
      });
      const outcomes = await Promise.all(
        Array.from({ length: 8 }, () => consumeKeyRequest(db, key.id)),
      );
      expect(outcomes.filter(Boolean)).toHaveLength(1);

      await db.apiKey.update({
        where: { id: key.id },
        data: { windowStart: new Date(Date.now() - 61_000), windowRequests: 1 },
      });
      expect(await consumeKeyRequest(db, key.id)).toBe(true);
      expect(await consumeKeyRequest(db, key.id)).toBe(false);
    } finally {
      await db.workspace.delete({ where: { id: workspace.id } });
      await db.$disconnect();
    }
  }, 90_000);
});
