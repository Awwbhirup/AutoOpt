/**
 * Workspace slugs.
 *
 * A slug goes in URLs, so it is ASCII, lowercase and hyphenated, and it is
 * derived once when the workspace is created rather than recomputed from the
 * name later: renaming a workspace must not break links people have saved.
 *
 * Uniqueness is decided by a predicate the caller supplies. Taking a database
 * handle here would make slug generation untestable without one, and the query
 * belongs to whoever owns the transaction that is about to insert the row.
 */

/** Readable, and short enough to sit in a URL without wrapping. */
const MAX_LENGTH = 48;

/** For a name with nothing ASCII in it at all. */
const FALLBACK = "workspace";

const NUMBERED_ATTEMPTS = 50;
const RANDOM_ATTEMPTS = 10;

export function slugify(name: string): string {
  const folded = name
    .normalize("NFKD")
    // Combining marks, which NFKD has just split off. Dropping them leaves the
    // ASCII base letter, so an accented name turns into a word rather than
    // losing the character entirely.
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();

  const slug = folded
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, MAX_LENGTH)
    // The slice can land mid-separator.
    .replace(/-+$/g, "");

  return slug || FALLBACK;
}

export type SlugExists = (slug: string) => boolean | Promise<boolean>;

export class SlugExhaustedError extends Error {
  constructor(readonly base: string) {
    super(`no free slug for ${base}`);
    this.name = "SlugExhaustedError";
  }
}

/**
 * The first free slug for this name.
 *
 * Candidates are offered one at a time because `exists` is a query, and asking
 * once per candidate costs less than fetching every slug that starts with the
 * base in order to pick a number locally.
 */
export async function uniqueSlug(
  name: string,
  exists: SlugExists,
): Promise<string> {
  const base = slugify(name);
  if (!(await exists(base))) return base;

  // Counted first, because "acme-2" reads like something a person chose.
  for (let n = 2; n <= NUMBERED_ATTEMPTS; n += 1) {
    const candidate = withSuffix(base, String(n));
    if (!(await exists(candidate))) return candidate;
  }

  // Past fifty the number has stopped carrying meaning and counting on costs a
  // query per attempt. A random suffix lands on a free slug in one or two.
  for (let attempt = 0; attempt < RANDOM_ATTEMPTS; attempt += 1) {
    const candidate = withSuffix(base, randomSuffix());
    if (!(await exists(candidate))) return candidate;
  }

  throw new SlugExhaustedError(base);
}

/** Suffixed and still within MAX_LENGTH, so a long name cannot push it over. */
function withSuffix(base: string, suffix: string): string {
  const room = Math.max(MAX_LENGTH - suffix.length - 1, 1);
  const trimmed = base.slice(0, room).replace(/-+$/g, "");
  return `${trimmed || FALLBACK}-${suffix}`;
}

function randomSuffix(): string {
  return Math.random().toString(36).slice(2, 8).padEnd(6, "0");
}
