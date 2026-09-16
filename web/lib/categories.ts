/**
 * The program categories, as the engine's corpus names them.
 *
 * The category is the blocking factor in the experiment grid, so it has to be
 * one of these and not free text: a program filed under a name the engine has
 * never heard of drops out of every per-category figure without saying so.
 */

export const CATEGORIES = [
  "arithmetic",
  "nested",
  "repeated",
  "dead_code",
  "loops",
  "conditional",
  "mixed",
] as const;

export type Category = (typeof CATEGORIES)[number];

export const DEFAULT_CATEGORY: Category = "mixed";

export function isCategory(value: string): value is Category {
  return (CATEGORIES as readonly string[]).includes(value);
}

/** For display. The stored value stays as the engine spells it. */
export function categoryLabel(value: string): string {
  return value.replace(/_/g, " ");
}
