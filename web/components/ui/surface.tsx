/**
 * The shapes the app pages are built from: a page header, a panel with a
 * heading, a stat tile, and a callout for something the reader should know.
 */

import type { ReactNode } from "react";

import { cx } from "@/lib/cx";

import { toneClass, type Tone } from "./badge";

export function PageHeader({
  title,
  eyebrow,
  lead,
  actions,
  children,
}: {
  title: ReactNode;
  /** A breadcrumb or a kind, printed small above the title. */
  eyebrow?: ReactNode;
  lead?: ReactNode;
  actions?: ReactNode;
  /** Facts under the lead, e.g. a row of metadata. */
  children?: ReactNode;
}) {
  return (
    <header className="mb-8 flex flex-wrap items-end justify-between gap-x-6 gap-y-4">
      <div className="min-w-0">
        {eyebrow ? (
          <div className="ui-mono mb-2 text-xs tracking-wide text-(--ui-ink-3)">{eyebrow}</div>
        ) : null}
        <h1 className="text-2xl font-bold tracking-tight text-balance break-words sm:text-[1.75rem]">
          {title}
        </h1>
        {lead ? (
          <p className="mt-2 max-w-2xl text-[0.95rem] leading-relaxed text-(--ui-ink-2)">{lead}</p>
        ) : null}
        {children}
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
    </header>
  );
}

export function Panel({
  title,
  aside,
  children,
  className,
  bodyClassName,
}: {
  title?: ReactNode;
  /** A link or a count, put opposite the title. */
  aside?: ReactNode;
  children: ReactNode;
  className?: string;
  bodyClassName?: string;
}) {
  return (
    <section className={cx("ui-glass min-w-0 rounded-xl", className)}>
      {title === undefined ? null : (
        <div className="flex min-h-11 items-center justify-between gap-3 border-b border-(--ui-border) px-4 py-2">
          <h2 className="text-sm font-semibold tracking-wide">{title}</h2>
          {aside ? <div className="text-xs text-(--ui-ink-3)">{aside}</div> : null}
        </div>
      )}
      <div className={bodyClassName}>{children}</div>
    </section>
  );
}

export function Stat({
  label,
  value,
  note,
  accent,
}: {
  label: string;
  value: ReactNode;
  note?: ReactNode;
  /** A ramp stop for the edge mark, e.g. "var(--ui-ramp-2)". */
  accent?: string;
}) {
  return (
    <div className="ui-glass relative min-w-0 overflow-hidden rounded-xl px-4 py-3">
      <span
        aria-hidden
        className="absolute inset-y-3 left-0 w-0.5 rounded-full"
        style={{ background: accent ?? "var(--ui-border-strong)" }}
      />
      <div className="text-[0.72rem] font-medium tracking-wider text-(--ui-ink-3) uppercase">
        {label}
      </div>
      <div className="ui-mono mt-1 text-2xl font-semibold tracking-tight">{value}</div>
      {note ? <div className="mt-0.5 text-xs text-(--ui-ink-3)">{note}</div> : null}
    </div>
  );
}

export function Callout({
  tone = "neutral",
  title,
  children,
  className,
}: {
  tone?: Tone;
  title?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      role={tone === "refused" ? "alert" : undefined}
      className={cx("rounded-lg border px-4 py-3 text-sm leading-relaxed", toneClass(tone), className)}
    >
      {title ? <p className="font-semibold">{title}</p> : null}
      <div className={cx(title ? "mt-0.5" : undefined, "text-(--ui-ink-2)")}>{children}</div>
    </div>
  );
}
