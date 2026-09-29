/**
 * The listing before and after the run, as a unified line diff: removed lines
 * in the refused colour, added in the kept colour, with both line numbers.
 */

import { diffLines, diffStats } from "@/lib/diff";
import { cx } from "@/lib/cx";

export function DiffView({ before, after }: { before: string[]; after: string[] }) {
  const lines = diffLines(before, after);
  const stats = diffStats(lines);
  return (
    <figure className="m-0">
      <figcaption className="mb-2 font-terminal text-xs text-muted tabular-nums">
        {before.length} lines before, {after.length} after:{" "}
        <span className="text-accent">+{stats.added}</span> <span className="text-refused">-{stats.removed}</span>
      </figcaption>
      <ol className="overflow-x-auto overscroll-x-contain rounded-lg border border-line bg-foreground/[0.03] py-1.5 font-terminal text-xs leading-6" data-lenis-prevent>
        {lines.map((line, index) => (
          <li
            key={index}
            className={cx(
              "grid grid-cols-[2.25rem_2.25rem_1.25rem_1fr] pr-3",
              line.kind === "add" && "bg-accent-soft",
              line.kind === "del" && "bg-refused-soft",
            )}
          >
            <span className="pr-2 text-right text-muted select-none">{line.kind === "add" ? "" : line.before}</span>
            <span className="pr-2 text-right text-muted select-none">{line.kind === "del" ? "" : line.after}</span>
            <span
              aria-hidden
              className={cx("select-none", line.kind === "add" ? "text-accent" : line.kind === "del" ? "text-refused" : "text-muted")}
            >
              {line.kind === "add" ? "+" : line.kind === "del" ? "-" : ""}
            </span>
            <span className={cx("whitespace-pre", line.kind === "del" && "text-foreground/60 line-through decoration-refused/60")}>
              <span className="sr-only">{line.kind === "add" ? "added: " : line.kind === "del" ? "removed: " : ""}</span>
              {line.text}
            </span>
          </li>
        ))}
      </ol>
    </figure>
  );
}
