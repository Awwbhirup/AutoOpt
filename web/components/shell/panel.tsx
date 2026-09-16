/**
 * The few shapes the signed-in pages are built out of: a bordered block with a
 * heading, a number with a label under it, and the line a page shows where
 * there is nothing to list yet.
 *
 * Here rather than repeated per page so that three pages cannot drift into
 * three slightly different borders.
 */

import type { ReactNode } from "react";

export function PageHeading({
  title,
  lead,
  actions,
}: {
  title: string;
  lead?: string;
  actions?: ReactNode;
}) {
  return (
    <header className="mb-6 flex flex-wrap items-start justify-between gap-3">
      <div>
        <h1 className="text-xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
          {title}
        </h1>
        {lead ? (
          <p className="mt-1 max-w-2xl text-sm text-zinc-600 dark:text-zinc-400">
            {lead}
          </p>
        ) : null}
      </div>
      {actions}
    </header>
  );
}

export function Panel({
  title,
  aside,
  children,
}: {
  title: string;
  /** A link or a count, put opposite the title. */
  aside?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="rounded border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-950">
      <div className="flex items-baseline justify-between gap-3 border-b border-zinc-200 px-3 py-2 dark:border-zinc-800">
        <h2 className="text-sm font-medium text-zinc-900 dark:text-zinc-100">
          {title}
        </h2>
        {aside ? (
          <span className="text-xs text-zinc-500 dark:text-zinc-400">{aside}</span>
        ) : null}
      </div>
      {children}
    </section>
  );
}

export function Stat({
  label,
  value,
  note,
}: {
  label: string;
  value: string | number;
  note?: string;
}) {
  return (
    <div className="rounded border border-zinc-200 px-3 py-2 dark:border-zinc-800">
      <div className="text-xs text-zinc-500 dark:text-zinc-400">{label}</div>
      <div className="mt-0.5 text-2xl font-semibold tabular-nums text-zinc-900 dark:text-zinc-50">
        {value}
      </div>
      {note ? (
        <div className="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">{note}</div>
      ) : null}
    </div>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return (
    <p className="px-3 py-8 text-center text-sm text-zinc-500 dark:text-zinc-400">
      {children}
    </p>
  );
}
