import { beforeEach, describe, expect, it, vi } from "vitest";

import { fakePrisma } from "../test-support/fake-prisma";

import { authenticateKey, hashKey, newKey } from "./keys";
import { consumeKeyRequest } from "./rate-limit";

vi.mock("./rate-limit", () => ({ consumeKeyRequest: vi.fn() }));
const consume = vi.mocked(consumeKeyRequest);

const NOW = new Date("2026-09-29T12:00:00Z");

function keyRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "key_1",
    workspaceId: "ws_1",
    createdById: "user_1",
    scopes: ["runs:read", "runs:write"],
    revokedAt: null,
    expiresAt: null,
    ...overrides,
  };
}

describe("newKey and hashKey", () => {
  it("makes prefixed keys that do not repeat", () => {
    const a = newKey();
    const b = newKey();
    expect(a).toMatch(/^ao_[A-Za-z0-9_-]{40,}$/);
    expect(a).not.toBe(b);
  });

  it("hashes deterministically and never returns the key itself", () => {
    const key = newKey();
    expect(hashKey(key)).toBe(hashKey(key));
    expect(hashKey(key)).toMatch(/^[0-9a-f]{64}$/);
    expect(hashKey(key)).not.toContain(key);
  });
});

describe("authenticateKey", () => {
  beforeEach(() => {
    consume.mockReset();
    consume.mockResolvedValue(true);
  });

  it("rejects a missing or malformed header without touching the database", async () => {
    for (const header of [null, "", "ao_abc", "Bearer", "Bearer not-a-key", "Basic ao_abc"]) {
      const db = fakePrisma();
      const result = await authenticateKey(db.client, header, "runs:read", NOW);
      expect(result).toMatchObject({ ok: false, status: 401 });
      expect(db.calls).toHaveLength(0);
    }
  });

  it("looks the key up by its hash, not by the key", async () => {
    const key = newKey();
    const db = fakePrisma({ "apiKey.findUnique": keyRow() });
    await authenticateKey(db.client, `Bearer ${key}`, "runs:read", NOW);
    expect(db.only().args.where).toEqual({ hash: hashKey(key) });
  });

  it("rejects an unknown key", async () => {
    const db = fakePrisma({ "apiKey.findUnique": null });
    const result = await authenticateKey(db.client, `Bearer ${newKey()}`, "runs:read", NOW);
    expect(result).toMatchObject({ ok: false, status: 401 });
  });

  it("rejects a revoked key", async () => {
    const db = fakePrisma({ "apiKey.findUnique": keyRow({ revokedAt: new Date("2026-09-01") }) });
    const result = await authenticateKey(db.client, `Bearer ${newKey()}`, "runs:read", NOW);
    expect(result).toMatchObject({ ok: false, status: 401 });
  });

  it("rejects a key that expired, including at the exact expiry instant", async () => {
    for (const expiresAt of [new Date("2026-09-28"), NOW]) {
      const db = fakePrisma({ "apiKey.findUnique": keyRow({ expiresAt }) });
      const result = await authenticateKey(db.client, `Bearer ${newKey()}`, "runs:read", NOW);
      expect(result).toMatchObject({ ok: false, status: 401 });
    }
  });

  it("refuses a scope the key was not given, before spending its rate window", async () => {
    const db = fakePrisma({ "apiKey.findUnique": keyRow({ scopes: ["runs:read"] }) });
    const result = await authenticateKey(db.client, `Bearer ${newKey()}`, "programs:write", NOW);
    expect(result).toMatchObject({ ok: false, status: 403 });
    expect(consume).not.toHaveBeenCalled();
  });

  it("returns 429 once the key's window is spent", async () => {
    consume.mockResolvedValue(false);
    const db = fakePrisma({ "apiKey.findUnique": keyRow() });
    const result = await authenticateKey(db.client, `Bearer ${newKey()}`, "runs:read", NOW);
    expect(result).toMatchObject({ ok: false, status: 429 });
    expect(consume).toHaveBeenCalledWith(db.client, "key_1");
  });

  it("returns the principal for a valid key with the scope", async () => {
    const db = fakePrisma({
      "apiKey.findUnique": keyRow({ expiresAt: new Date("2026-12-01") }),
    });
    const result = await authenticateKey(db.client, `Bearer ${newKey()}`, "runs:write", NOW);
    expect(result).toEqual({
      ok: true,
      principal: { id: "key_1", workspaceId: "ws_1", createdById: "user_1" },
    });
  });
});
