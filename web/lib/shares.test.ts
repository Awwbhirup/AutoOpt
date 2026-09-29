import { describe, expect, it } from "vitest";

import { expiryFrom, newShareToken, shareState, TOKEN_PATTERN } from "./shares";

const NOW = new Date("2026-09-29T12:00:00Z");

describe("share tokens", () => {
  it("are url safe, the expected length, and different each time", () => {
    const a = newShareToken();
    const b = newShareToken();
    expect(a).toMatch(TOKEN_PATTERN);
    expect(a).toHaveLength(24);
    expect(a).not.toBe(b);
  });
});

describe("expiryFrom", () => {
  it("maps the options to dates, never to null, and junk to undefined", () => {
    expect(expiryFrom("never", NOW)).toBeNull();
    expect(expiryFrom("7d", NOW)?.toISOString()).toBe("2026-10-06T12:00:00.000Z");
    expect(expiryFrom("1y", NOW)).toBeUndefined();
  });
});

describe("shareState", () => {
  it("prefers revoked, then expired, else active", () => {
    const past = new Date("2026-09-01T00:00:00Z");
    const future = new Date("2026-12-01T00:00:00Z");
    expect(shareState({ revokedAt: past, expiresAt: future }, NOW)).toBe("revoked");
    expect(shareState({ revokedAt: null, expiresAt: past }, NOW)).toBe("expired");
    expect(shareState({ revokedAt: null, expiresAt: NOW }, NOW)).toBe("expired");
    expect(shareState({ revokedAt: null, expiresAt: null }, NOW)).toBe("active");
  });
});
