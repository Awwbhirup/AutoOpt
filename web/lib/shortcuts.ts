/**
 * Two-key navigation shortcuts ("g" then a letter), as a small state machine
 * so the timing and the typing-in-a-field rule are testable without a DOM.
 */

export interface Shortcut {
  keys: [string, string];
  label: string;
  /** "workspace" paths are under /w/[slug]; "site" paths are absolute. */
  scope: "workspace" | "site";
  path: string;
}

export const SHORTCUTS: Shortcut[] = [
  { keys: ["g", "d"], label: "Dashboard", scope: "workspace", path: "" },
  { keys: ["g", "p"], label: "Projects", scope: "workspace", path: "/projects" },
  { keys: ["g", "r"], label: "Runs", scope: "workspace", path: "/runs" },
  { keys: ["g", "s"], label: "Suites", scope: "workspace", path: "/suites" },
  { keys: ["g", "a"], label: "Analytics", scope: "workspace", path: "/analytics" },
  { keys: ["g", "m"], label: "People", scope: "workspace", path: "/settings" },
  { keys: ["g", "t"], label: "Playground", scope: "site", path: "/try" },
];

/** A second key later than this after the first starts over. */
export const SEQUENCE_MS = 1200;

export interface SequenceState {
  first: string | null;
  at: number;
}

export const IDLE_SEQUENCE: SequenceState = { first: null, at: 0 };

/**
 * Feed one key press. Returns the shortcut it completes, if any, and the state
 * to keep. Keys with modifiers never start or finish a sequence.
 */
export function pressKey(
  state: SequenceState,
  key: string,
  now: number,
  modified: boolean,
): { state: SequenceState; match: Shortcut | null } {
  if (modified) return { state: IDLE_SEQUENCE, match: null };
  const lower = key.toLowerCase();
  if (state.first !== null && now - state.at <= SEQUENCE_MS) {
    const match = SHORTCUTS.find((shortcut) => shortcut.keys[0] === state.first && shortcut.keys[1] === lower);
    if (match) return { state: IDLE_SEQUENCE, match };
  }
  const starts = SHORTCUTS.some((shortcut) => shortcut.keys[0] === lower);
  return { state: starts ? { first: lower, at: now } : IDLE_SEQUENCE, match: null };
}

/** Typing into a field, a select or an editor is text, not a shortcut. */
export function isTypingTarget(target: { tagName?: string; isContentEditable?: boolean } | null): boolean {
  if (target === null) return false;
  if (target.isContentEditable) return true;
  return ["INPUT", "TEXTAREA", "SELECT"].includes((target.tagName ?? "").toUpperCase());
}

export function shortcutHref(shortcut: Shortcut, slug: string): string {
  return shortcut.scope === "site" ? shortcut.path : `/w/${slug}${shortcut.path}`;
}
