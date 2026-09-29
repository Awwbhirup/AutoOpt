/**
 * A three-address-code listing, with the line a rewrite touched marked.
 *
 * The listing is numbered from 1 to match how the engine reports a site, and
 * the marked range comes from comparing against the previous listing rather
 * than from the event, so the mark is always what actually changed and not what
 * the proposal claimed to change.
 *
 * A rewrite that only removes lines leaves nothing to mark, so the gap is drawn
 * where the lines used to be.
 */

import type { ReactNode } from "react";

import { lineChange } from "@/lib/trace";

export function TacListing({
  lines,
  previous = null,
  label,
}: {
  lines: string[];
  previous?: string[] | null;
  label?: string;
}) {
  const change = previous === null ? null : lineChange(previous, lines);
  const seam = change !== null && change.length === 0 && change.removed > 0 ? change.start : null;
  const removedAtSeam = change === null ? 0 : change.removed;

  const changed = (index: number): boolean =>
    change !== null && index >= change.start && index < change.start + change.length;

  const gap = (key: string, removed: number): ReactNode => (
    <li
      key={key}
      className="flex items-center gap-2 border-l-2 border-refused bg-refused-soft px-2 py-0.5 text-muted"
    >
      <span aria-hidden className="w-6 shrink-0 text-right text-muted opacity-70">
        --
      </span>
      <span className="italic">
        {removed} {removed === 1 ? "line" : "lines"} removed
      </span>
    </li>
  );

  const rows: ReactNode[] = [];
  lines.forEach((line, index) => {
    if (seam === index) rows.push(gap(`gap-${index}`, removedAtSeam));
    const mark = changed(index);
    rows.push(
      <li
        key={index}
        className={
          mark
            ? "flex gap-2 border-l-2 border-flag bg-flag/10 px-2 py-0.5"
            : "flex gap-2 border-l-2 border-transparent px-2 py-0.5"
        }
      >
        <span
          aria-hidden
          className="w-6 shrink-0 select-none text-right text-muted tabular-nums opacity-70"
        >
          {index + 1}
        </span>
        {mark ? <span className="sr-only">changed line {index + 1}: </span> : null}
        <span className="whitespace-pre text-foreground">{line}</span>
      </li>,
    );
  });
  if (seam === lines.length) rows.push(gap("gap-end", removedAtSeam));

  return (
    <figure className="m-0">
      {label === undefined ? null : (
        <figcaption className="mb-1 text-xs font-medium text-muted">
          {label}
        </figcaption>
      )}
      {lines.length === 0 ? (
        <p className="px-2 py-1 font-terminal tabular-nums text-xs text-muted">
          no listing yet
        </p>
      ) : (
        <ol data-lenis-prevent
          className="font-terminal tabular-nums overflow-x-auto overscroll-x-contain rounded-lg border border-line bg-foreground/5 py-1.5 text-xs leading-5">
          {rows}
        </ol>
      )}
    </figure>
  );
}
