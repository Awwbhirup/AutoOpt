/**
 * Share links: an unguessable token that opens one run or one suite run's
 * results to anyone holding it, read-only, until it is revoked or expires.
 */

import { randomBytes } from "node:crypto";

/** 18 random bytes, 24 characters of base64url: not guessable, short enough to paste. */
export function newShareToken(): string {
  return randomBytes(18).toString("base64url");
}

export const TOKEN_PATTERN = /^[A-Za-z0-9_-]{16,64}$/;

export const EXPIRY_OPTIONS = {
  never: { label: "Never", days: null },
  "1d": { label: "1 day", days: 1 },
  "7d": { label: "7 days", days: 7 },
  "30d": { label: "30 days", days: 30 },
} as const;

export type ExpiryKey = keyof typeof EXPIRY_OPTIONS;

export function expiryFrom(key: string, now: Date): Date | null | undefined {
  if (!(key in EXPIRY_OPTIONS)) return undefined;
  const days = EXPIRY_OPTIONS[key as ExpiryKey].days;
  return days === null ? null : new Date(now.getTime() + days * 86_400_000);
}

export type ShareState = "active" | "revoked" | "expired";

export function shareState(
  link: { revokedAt: Date | null; expiresAt: Date | null },
  now: Date,
): ShareState {
  if (link.revokedAt !== null) return "revoked";
  if (link.expiresAt !== null && link.expiresAt.getTime() <= now.getTime()) return "expired";
  return "active";
}

export function sharePath(token: string): string {
  return `/s/${token}`;
}
