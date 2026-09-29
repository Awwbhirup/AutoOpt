/**
 * A table described by its columns. Works in server components: cells are
 * render functions called here, so nothing but markup crosses to the client.
 *
 * Numbers align right and use tabular figures. Wide tables scroll inside their
 * own box instead of pushing the page sideways on a phone.
 */

import type { ReactNode } from "react";

import { cx } from "@/lib/cx";

export interface Column<T> {
  key: string;
  header: ReactNode;
  cell: (row: T) => ReactNode;
  align?: "left" | "right";
  /** Data rather than prose: mono face, slightly smaller. */
  mono?: boolean;
  /** Hidden below the sm breakpoint, for columns a phone can live without. */
  wide?: boolean;
  className?: string;
}

export function DataTable<T>({
  columns,
  rows,
  rowKey,
  caption,
  empty,
  className,
}: {
  columns: Column<T>[];
  rows: readonly T[];
  rowKey: (row: T) => string;
  /** Read by screen readers; not drawn. */
  caption?: string;
  /** Shown in place of the table when there are no rows. */
  empty?: ReactNode;
  className?: string;
}) {
  if (rows.length === 0 && empty !== undefined) return <>{empty}</>;

  return (
    <div className={cx("overflow-x-auto overscroll-x-contain", className)} data-lenis-prevent>
      <table className="w-full border-collapse text-left text-sm">
        {caption ? <caption className="sr-only">{caption}</caption> : null}
        <thead>
          <tr className="border-b border-(--ui-border)">
            {columns.map((column) => (
              <th
                key={column.key}
                scope="col"
                className={cx(
                  "h-9 px-4 text-[0.72rem] font-medium tracking-wider whitespace-nowrap text-(--ui-ink-3) uppercase",
                  column.align === "right" && "text-right",
                  column.wide && "hidden sm:table-cell",
                )}
              >
                {column.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr
              key={rowKey(row)}
              className="h-11 border-b border-(--ui-border) transition-colors last:border-b-0 hover:bg-[color-mix(in_oklab,var(--ui-sunken)_70%,transparent)]"
            >
              {columns.map((column) => (
                <td
                  key={column.key}
                  className={cx(
                    "px-4 py-2 align-middle",
                    column.align === "right" && "text-right",
                    column.mono && "ui-mono text-xs text-(--ui-ink-2)",
                    column.wide && "hidden sm:table-cell",
                    column.className,
                  )}
                >
                  {column.cell(row)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
