/** A short ranked list of labels with counts and a share bar, for breakdowns. */

import type { CountedLabel } from "@/lib/repositories/analytics";

export function CountedList({
  items,
  label,
  tone = "bg-foreground/40",
}: {
  items: CountedLabel[];
  label: (value: string) => string;
  tone?: string;
}) {
  const total = items.reduce((sum, item) => sum + item.count, 0);
  if (total === 0) return <p className="text-sm text-muted">Nothing recorded in this range.</p>;
  return (
    <ul className="flex flex-col gap-2">
      {items.map((item) => (
        <li key={item.label} className="grid grid-cols-[minmax(0,1fr)_3.5rem] items-center gap-x-3 gap-y-1">
          <span className="truncate text-sm">{label(item.label)}</span>
          <span className="text-right font-terminal text-xs tabular-nums">{item.count}</span>
          <span className="col-span-2 h-1.5 overflow-hidden rounded-full bg-foreground/5">
            <span className={`block h-full rounded-full ${tone}`} style={{ width: `${(item.count / total) * 100}%` }} />
          </span>
        </li>
      ))}
    </ul>
  );
}
