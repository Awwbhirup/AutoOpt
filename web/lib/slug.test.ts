/**
 * Slugs, with the cases that come from real workspace names: punctuation,
 * accents, scripts with no ASCII in them at all, and the same name typed twice.
 */

import { describe, expect, it } from "vitest";

import { slugify, SlugExhaustedError, uniqueSlug } from "./slug";

const MAX_LENGTH = 48;

describe("slugify", () => {
  it("lowercases and hyphenates", () => {
    expect(slugify("Acme Optimizations")).toBe("acme-optimizations");
  });

  it("keeps digits", () => {
    expect(slugify("Team 42")).toBe("team-42");
  });

  it("collapses runs of separators into one hyphen", () => {
    expect(slugify("a   b___c/d")).toBe("a-b-c-d");
  });

  it("drops leading and trailing separators", () => {
    expect(slugify("  --Acme--  ")).toBe("acme");
  });

  it("drops punctuation", () => {
    expect(slugify("Ben's #1 Lab (v2)")).toBe("ben-s-1-lab-v2");
  });

  it("folds accents to their ASCII base letter", () => {
    expect(slugify("Cafe\u0301 Zu\u0308rich")).toBe("cafe-zurich");
    expect(slugify("\u00c9quipe Fran\u00e7ais")).toBe("equipe-francais");
  });

  it("strips characters with no ASCII form", () => {
    expect(slugify("Acme \u65e5\u672c\u8a9e Lab")).toBe("acme-lab");
    expect(slugify("Acme \ud83d\ude80")).toBe("acme");
  });

  it("falls back when nothing ASCII survives", () => {
    expect(slugify("\u65e5\u672c\u8a9e")).toBe("workspace");
    expect(slugify("")).toBe("workspace");
    expect(slugify("   ")).toBe("workspace");
    expect(slugify("!!!")).toBe("workspace");
  });

  it("truncates without leaving a trailing hyphen", () => {
    const slug = slugify("a".repeat(60));
    expect(slug).toHaveLength(MAX_LENGTH);

    // One short of the limit, so the cut falls on the separator itself.
    const cut = slugify(`${"a".repeat(MAX_LENGTH - 1)} tail`);
    expect(cut).toBe("a".repeat(MAX_LENGTH - 1));
    expect(cut.endsWith("-")).toBe(false);
  });

  it("is idempotent, so a slug read back and reslugged is unchanged", () => {
    for (const name of ["Acme Optimizations", "Cafe\u0301", "!!!", "Team 42"]) {
      expect(slugify(slugify(name))).toBe(slugify(name));
    }
  });
});

describe("uniqueSlug", () => {
  it("uses the plain slug when it is free", async () => {
    expect(await uniqueSlug("Acme Lab", () => false)).toBe("acme-lab");
  });

  it("accepts a synchronous predicate", async () => {
    const taken = new Set(["acme-lab"]);
    expect(await uniqueSlug("Acme Lab", (slug) => taken.has(slug))).toBe(
      "acme-lab-2",
    );
  });

  it("counts up past every taken slug", async () => {
    const taken = new Set(["acme-lab", "acme-lab-2", "acme-lab-3"]);
    expect(await uniqueSlug("Acme Lab", async (slug) => taken.has(slug))).toBe(
      "acme-lab-4",
    );
  });

  it("asks about candidates in order and stops at the first free one", async () => {
    const asked: string[] = [];
    const taken = new Set(["acme-lab", "acme-lab-2"]);
    await uniqueSlug("Acme Lab", (slug) => {
      asked.push(slug);
      return taken.has(slug);
    });
    expect(asked).toEqual(["acme-lab", "acme-lab-2", "acme-lab-3"]);
  });

  it("keeps a suffixed slug within the length limit", async () => {
    const name = "b".repeat(80);
    const taken = new Set([slugify(name)]);
    const slug = await uniqueSlug(name, (candidate) => taken.has(candidate));

    expect(slug.length).toBeLessThanOrEqual(MAX_LENGTH);
    expect(slug.endsWith("-2")).toBe(true);
    expect(taken.has(slug)).toBe(false);
  });

  it("switches to a random suffix once counting is exhausted", async () => {
    const taken = new Set(["acme-lab"]);
    for (let n = 2; n <= 50; n += 1) taken.add(`acme-lab-${n}`);

    const slug = await uniqueSlug("Acme Lab", (candidate) =>
      taken.has(candidate),
    );
    expect(slug).toMatch(/^acme-lab-[a-z0-9]{6}$/);
    expect(taken.has(slug)).toBe(false);
  });

  it("gives up rather than looping forever when everything is taken", async () => {
    await expect(uniqueSlug("Acme Lab", () => true)).rejects.toBeInstanceOf(
      SlugExhaustedError,
    );
  });
});
