/**
 * Runs started per day, stacked: finished well at the bottom, failed or
 * abandoned above, anything still going on top. Status colours with a legend,
 * and every bar says its day and counts on hover.
 */

import type { DayCount } from "@/lib/analytics";

const HEIGHT = 160;

const SHORT = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", timeZone: "UTC" });

function label(day: string): string {
  return SHORT.format(new Date(`${day}T00:00:00Z`));
}

export function RunsOverTime({ days }: { days: DayCount[] }) {
  const totals = days.map((day) => day.succeeded + day.failed + day.other);
  const max = Math.max(1, ...totals);
  const every = Math.max(1, Math.ceil(days.length / 5));

  return (
    <figure className="m-0">
      <ul className="mb-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-foreground/75">
        <li className="flex items-center gap-1.5">
          <span aria-hidden className="size-2.5 rounded-sm bg-accent" /> succeeded
        </li>
        <li className="flex items-center gap-1.5">
          <span aria-hidden className="size-2.5 rounded-sm bg-refused" /> failed or abandoned
        </li>
        <li className="flex items-center gap-1.5">
          <span aria-hidden className="size-2.5 rounded-sm bg-muted/50" /> running or queued
        </li>
      </ul>
      <div className="grid grid-cols-[2rem_minmax(0,1fr)] gap-2">
        <div className="relative font-terminal text-xs text-muted tabular-nums" style={{ height: HEIGHT }}>
          <span className="absolute top-0 right-0 -translate-y-1/2">{max}</span>
          <span className="absolute right-0 bottom-0 translate-y-1/2">0</span>
        </div>
        <div className="relative border-b border-line" style={{ height: HEIGHT }}>
          <span aria-hidden className="absolute inset-x-0 top-0 border-t border-dashed border-line" />
          <span aria-hidden className="absolute inset-x-0 top-1/2 border-t border-dashed border-line" />
          <div className="absolute inset-0 flex items-end gap-[2px]">
            {days.map((day, index) => {
              const total = totals[index];
              return (
                <div
                  key={day.day}
                  title={`${label(day.day)}: ${total} runs, ${day.succeeded} succeeded, ${day.failed} failed or abandoned${day.other ? `, ${day.other} running` : ""}`}
                  className="group flex h-full min-w-0 flex-1 flex-col justify-end"
                >
                  <div
                    className="flex flex-col-reverse gap-[2px] overflow-hidden rounded-t-[4px] transition-opacity group-hover:opacity-80"
                    style={{ height: `${(total / max) * 100}%` }}
                  >
                    {day.succeeded ? <span className="bg-accent" style={{ flexGrow: day.succeeded }} /> : null}
                    {day.failed ? <span className="bg-refused" style={{ flexGrow: day.failed }} /> : null}
                    {day.other ? <span className="bg-muted/50" style={{ flexGrow: day.other }} /> : null}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
        <span />
        <div className="relative h-5">
          {days.map((day, index) =>
            index % every === 0 ? (
              <span
                key={day.day}
                className={`absolute -translate-x-1/2 font-terminal text-xs whitespace-nowrap text-muted ${(index / every) % 2 === 1 ? "hidden sm:inline" : ""}`}
                style={{ left: `${((index + 0.5) / days.length) * 100}%` }}
              >
                {label(day.day)}
              </span>
            ) : null,
          )}
        </div>
      </div>
      <figcaption className="sr-only">
        Runs per day: {days.map((day, index) => `${label(day.day)} ${totals[index]}`).join(", ")}.
      </figcaption>
    </figure>
  );
}
