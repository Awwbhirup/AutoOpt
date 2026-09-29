/**
 * What a list shows when there is nothing in it: what would be here, and the
 * one thing to do about it. The figure is a small flow graph with no edges
 * taken yet, drawn in the ramp's first colours.
 */

import type { ReactNode } from "react";

import { cx } from "@/lib/cx";

function Figure() {
  return (
    <svg aria-hidden viewBox="0 0 64 40" className="h-10 w-16">
      <g fill="none" strokeWidth="1.5">
        <path d="M14 20h12M38 20h12" stroke="var(--muted)" strokeDasharray="2 3" />
        <rect x="2" y="13" width="12" height="14" rx="3" stroke="var(--ramp-0)" />
        <rect x="26" y="13" width="12" height="14" rx="3" stroke="var(--ramp-1)" />
        <rect x="50" y="13" width="12" height="14" rx="3" stroke="var(--muted)" strokeDasharray="2 2" />
      </g>
    </svg>
  );
}

export function EmptyState({
  title,
  children,
  action,
  compact = false,
  className,
}: {
  title: string;
  children?: ReactNode;
  action?: ReactNode;
  /** Inside a panel: less padding, no figure. */
  compact?: boolean;
  className?: string;
}) {
  return (
    <div
      className={cx(
        "flex flex-col items-center text-center",
        compact ? "gap-1.5 px-4 py-8" : "gap-3 px-6 py-14",
        className,
      )}
    >
      {compact ? null : <Figure />}
      <p className="text-sm font-semibold text-foreground">{title}</p>
      {children ? (
        <div className="max-w-md text-sm leading-relaxed text-foreground/75">{children}</div>
      ) : null}
      {action ? <div className="mt-2">{action}</div> : null}
    </div>
  );
}
