/**
 * What bcrypt does quietly, asserted loudly.
 *
 * The round trip is the easy half. The half worth the file is the 72-byte
 * limit: left alone, bcrypt answers yes to a password that only matches
 * because the part that differed was never hashed.
 */

import { hash } from "bcryptjs";
import { describe, expect, it } from "vitest";

import { hashPassword, MAX_PASSWORD_BYTES, PasswordError, verifyPassword } from "./password";

const PASSWORD = "correct horse battery staple";

describe("hashing and verifying", () => {
  it("accepts the password it was given", async () => {
    const stored = await hashPassword(PASSWORD);
    expect(await verifyPassword(PASSWORD, stored)).toBe(true);
  });

  it("refuses a password that is nearly right", async () => {
    const stored = await hashPassword(PASSWORD);
    expect(await verifyPassword("correct horse battery stapl", stored)).toBe(false);
    expect(await verifyPassword(PASSWORD.toUpperCase(), stored)).toBe(false);
  });

  it("hashes the same password differently every time", async () => {
    // Salted, so a password reused across two accounts is not visible as one.
    expect(await hashPassword(PASSWORD)).not.toBe(await hashPassword(PASSWORD));
  });

  it("refuses a user who has no password", async () => {
    // Signed up through GitHub. Nothing to compare against, and no password
    // may be made to match nothing.
    expect(await verifyPassword(PASSWORD, null)).toBe(false);
    expect(await verifyPassword(PASSWORD, undefined)).toBe(false);
    expect(await verifyPassword(PASSWORD, "")).toBe(false);
  });

  it("refuses an empty password at both ends", async () => {
    await expect(hashPassword("")).rejects.toBeInstanceOf(PasswordError);
    // Against a hash of the empty string, which nothing here would write but
    // bcrypt is glad to produce and to match. Compared with a hash of a real
    // password this comes back false whether or not we check, which is why the
    // hash is built here rather than with hashPassword.
    expect(await verifyPassword("", await hash("", 4))).toBe(false);
  });

  it("spends as long on a missing hash as on a wrong password", async () => {
    // A sign-in that returns instantly for an address with no password behind
    // it, and after a hash for one that has, tells an attacker which addresses
    // are registered no matter what the response body says. The margin is wide
    // because the real comparison is hundreds of milliseconds and a slow
    // machine only makes it wider.
    const started = performance.now();
    expect(await verifyPassword(PASSWORD, null)).toBe(false);
    expect(performance.now() - started).toBeGreaterThan(50);
  });
});

describe("the 72 byte limit", () => {
  const AT_LIMIT = "a".repeat(MAX_PASSWORD_BYTES);

  it("stores a password that is exactly at the limit", async () => {
    expect(await verifyPassword(AT_LIMIT, await hashPassword(AT_LIMIT))).toBe(true);
  });

  it("refuses to store a password past the limit", async () => {
    await expect(hashPassword(`${AT_LIMIT}b`)).rejects.toBeInstanceOf(PasswordError);
  });

  it("refuses a longer password that shares the first 72 bytes", async () => {
    // The footgun itself: bcrypt hashes 72 bytes and drops the rest, so this
    // comparison comes back true unless the length is checked before it.
    const stored = await hashPassword(AT_LIMIT);
    expect(await verifyPassword(`${AT_LIMIT} and quite a lot more`, stored)).toBe(false);
  });

  it("counts bytes and not characters", async () => {
    // Thirty-six accented characters: 36 long, 72 bytes encoded.
    const accented = "\u00e9".repeat(36);
    expect(accented.length).toBe(36);
    expect(await verifyPassword(accented, await hashPassword(accented))).toBe(true);
    await expect(hashPassword(`${accented}\u00e9`)).rejects.toBeInstanceOf(PasswordError);
  });
});
