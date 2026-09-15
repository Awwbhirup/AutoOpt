/**
 * Password hashing, with bcrypt's 72-byte limit made explicit.
 *
 * bcrypt hashes the first 72 bytes of its input and ignores the rest without
 * complaining, so two different long passwords verify against the same hash.
 * That is inherited silently unless something refuses it, so anything past the
 * limit is rejected at both ends: a password that cannot be stored faithfully
 * is never stored, and a candidate that could only match by truncation does not
 * match.
 *
 * The limit is on the UTF-8 encoding, not on characters, which is why an
 * accented passphrase reaches it sooner than its length suggests.
 */

import { compare, hash } from "bcryptjs";

/**
 * Work factor. Roughly 0.4s per hash on a laptop: slow enough that guessing is
 * a hardware problem rather than a scripting one, quick enough to sit inside a
 * sign-in request.
 */
const COST = 12;

/** bcrypt's limit, not a policy of ours. */
export const MAX_PASSWORD_BYTES = 72;

/**
 * A hash of a phrase nobody was ever given. Stands in when there is no stored
 * hash, so only its cost matters: regenerate it if COST changes, or the two
 * paths stop taking the same time.
 */
const ABSENT_HASH = "$2b$12$7y53L4Lkmc2BogCGlbZDCOS8mVO/uUwQwyarvNLTRTSeVySqImI66";

export class PasswordError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PasswordError";
  }
}

function byteLength(password: string): number {
  return new TextEncoder().encode(password).length;
}

/**
 * Hash a password for storage in User.passwordHash.
 *
 * Throws rather than returning null, because a password that cannot be stored
 * is a mistake the caller has to handle before a row is written. How long a
 * password ought to be is a separate question and belongs to whatever collects
 * it; the only rules here are the ones bcrypt imposes.
 */
export async function hashPassword(password: string): Promise<string> {
  if (password.length === 0) {
    throw new PasswordError("password is empty");
  }
  const bytes = byteLength(password);
  if (bytes > MAX_PASSWORD_BYTES) {
    throw new PasswordError(
      `password is ${bytes} bytes, over bcrypt's ${MAX_PASSWORD_BYTES} byte limit`,
    );
  }
  return hash(password, COST);
}

/**
 * Check a password against a stored hash.
 *
 * `stored` is nullable because a user who signed up through GitHub has no
 * password at all, and because the caller may have found no user at all. Both
 * are ordinary failed sign-ins, not errors worth distinguishing to the caller,
 * since telling them apart in a response is how an account list leaks. The same
 * goes for telling them apart by how long the answer took, which is why the
 * absent case still pays for a comparison.
 */
export async function verifyPassword(
  password: string,
  stored: string | null | undefined,
): Promise<boolean> {
  // These two depend on the candidate alone, so returning early on them reveals
  // nothing about the account it was offered for.
  if (password.length === 0) return false;
  // Past the limit it could only match by truncation, which is the thing being
  // avoided. bcrypt would happily say yes.
  if (byteLength(password) > MAX_PASSWORD_BYTES) return false;

  if (!stored) {
    // The result is discarded on purpose. What is wanted is the time it took.
    await compare(password, ABSENT_HASH);
    return false;
  }
  return compare(password, stored);
}
