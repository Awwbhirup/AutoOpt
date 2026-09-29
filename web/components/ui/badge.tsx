/**
 * A short label with a tone. Every badge prints its meaning in words and can
 * carry a mono marker glyph, so colour is never the only cue.
 */

import type { ReactNode } from "react";

import { cx } from "@/lib/cx";

export type Tone = "kept" | "refused" | "caution" | "info" | "neutral";

export function toneClass(tone: Tone): string {
  return `ui-tone-${tone}`;
}

export function Badge({
  tone = "neutral",
  mark,
  dashed = false,
  className,
  children,
}: {
  tone?: Tone;
  /** One character, e.g. "+" or "x", shown before the label. */
  mark?: string;
  dashed?: boolean;
  className?: string;
  children: ReactNode;
}) {
  return (
    <span
      className={cx(
        "inline-flex items-center gap-1 rounded border px-1.5 py-0.5 text-xs font-medium whitespace-nowrap",
        toneClass(tone),
        dashed && "border-dashed",
        className,
      )}
    >
      {mark ? (
        <span aria-hidden className="ui-mono">
          {mark}
        </span>
      ) : null}
      {children}
    </span>
  );
}
