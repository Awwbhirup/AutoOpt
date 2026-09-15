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
      className="flex items-center gap-2 border-l-2 border-rose-400 bg-rose-50/60 px-2 py-0.5 text-zinc-500 dark:border-rose-700 dark:bg-rose-950/30 dark:text-zinc-400"
    >
      <span aria-hidden className="w-6 shrink-0 text-right text-zinc-400 dark:text-zinc-600">
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
            ? "flex gap-2 border-l-2 border-amber-400 bg-amber-50 px-2 py-0.5 dark:border-amber-600 dark:bg-amber-950/40"
            : "flex gap-2 border-l-2 border-transparent px-2 py-0.5"
        }
      >
        <span
          aria-hidden
          className="w-6 shrink-0 select-none text-right text-zinc-400 tabular-nums dark:text-zinc-600"
        >
          {index + 1}
        </span>
        {mark ? <span className="sr-only">changed line {index + 1}: </span> : null}
        <span className="whitespace-pre text-zinc-800 dark:text-zinc-200">{line}</span>
      </li>,
    );
  });
  if (seam === lines.length) rows.push(gap("gap-end", removedAtSeam));

  return (
    <figure className="m-0">
      {label === undefined ? null : (
        <figcaption className="mb-1 text-xs font-medium text-zinc-500 dark:text-zinc-400">
          {label}
        </figcaption>
      )}
      {lines.length === 0 ? (
        <p className="px-2 py-1 font-mono text-xs text-zinc-500 dark:text-zinc-400">
          no listing yet
        </p>
      ) : (
        <ol className="overflow-x-auto rounded border border-zinc-200 bg-white py-1 font-mono text-xs leading-5 dark:border-zinc-800 dark:bg-zinc-950">
          {rows}
        </ol>
      )}
    </figure>
  );
}
