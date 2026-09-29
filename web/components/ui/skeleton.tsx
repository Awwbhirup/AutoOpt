/**
 * Placeholders shaped like what is loading. Each one takes the size of the
 * thing it stands in for, so the page does not move when the data arrives.
 */

import { cx } from "@/lib/cx";

export function Skeleton({ className }: { className?: string }) {
  return <span aria-hidden className={cx("ui-skeleton block rounded", className)} />;
}

/** Lines of text; the last one shorter, the way a paragraph ends. */
export function SkeletonText({ lines = 2, className }: { lines?: number; className?: string }) {
  return (
    <span aria-hidden className={cx("flex flex-col gap-2", className)}>
      {Array.from({ length: lines }, (_, index) => (
        <Skeleton
          key={index}
          className={cx("h-3", index === lines - 1 && lines > 1 ? "w-3/5" : "w-full")}
        />
      ))}
    </span>
  );
}

/** A table body's worth of rows, matching the DataTable's row height. */
export function SkeletonRows({ rows = 6, columns = 5 }: { rows?: number; columns?: number }) {
  return (
    <div aria-hidden className="divide-y divide-line">
      {Array.from({ length: rows }, (_, row) => (
        <div key={row} className="flex h-11 items-center gap-4 px-4">
          {Array.from({ length: columns }, (_, column) => (
            <Skeleton
              key={column}
              className={cx("h-3", column === 0 ? "w-40 max-w-[30%]" : "flex-1")}
            />
          ))}
        </div>
      ))}
    </div>
  );
}

/** Announces the wait once, for screen readers; the shapes are aria-hidden. */
export function LoadingNote({ label = "Loading" }: { label?: string }) {
  return (
    <span role="status" className="sr-only">
      {label}
    </span>
  );
}
