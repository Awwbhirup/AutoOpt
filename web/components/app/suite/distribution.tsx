/**
 * Cost reduction per method: a box (quartiles), whiskers (range), a median
 * tick and every run as a dot, one row per method, best at the top.
 *
 * Drawn in HTML with percentage positions rather than an SVG viewBox, so the
 * labels stay in the page's type at any width and the marks stay crisp. Each
 * row is labelled in words, and each mark carries a title for hover, so the
 * ramp colour (rank by median) is never the only way to tell rows apart.
 */

import { Badge } from "@/components/ui/badge";
import { rampAt } from "@/lib/ramp";
import type { MethodResult } from "@/lib/suites/results";

function niceMax(value: number): number {
  const step = value <= 20 ? 5 : value <= 60 ? 10 : 20;
  return Math.max(step, Math.ceil(value / step) * step);
}

function ticks(min: number, max: number): number[] {
  const span = max - min;
  const step = span <= 20 ? 5 : span <= 60 ? 10 : 20;
  const out: number[] = [];
  for (let value = Math.ceil(min / step) * step; value <= max + 1e-9; value += step) out.push(value);
  return out;
}

/** Deterministic vertical jitter, so dots at the same value do not stack into one. */
function jitter(index: number): number {
  const x = Math.sin(index * 12.9898) * 43758.5453;
  return (x - Math.floor(x)) * 2 - 1;
}

const fmt = (value: number | null) => (value === null ? "n/a" : `${value.toFixed(1)}%`);

export function ReductionDistribution({ methods }: { methods: MethodResult[] }) {
  const values = methods.flatMap((method) => method.reductions);
  const low = Math.min(0, ...values);
  const high = niceMax(Math.max(10, ...values));
  const min = low < 0 ? -niceMax(-low) : 0;
  const at = (value: number) => ((value - min) / (high - min)) * 100;
  const axis = ticks(min, high);

  // Colour by rank among methods that have a median; rows show best first.
  const ranked = methods.filter((method) => method.spread.median !== null);
  const colour = (method: MethodResult) => {
    const index = ranked.indexOf(method);
    return index === -1 ? "var(--muted)" : rampAt(ranked.length <= 1 ? 1 : index / (ranked.length - 1));
  };
  const rows = [...methods].reverse();

  return (
    <figure className="m-0">
      <div className="flex flex-col">
        {rows.map((method) => {
          const { spread } = method;
          const c = colour(method);
          return (
            <div
              key={method.method}
              className="grid grid-cols-[minmax(0,8.5rem)_minmax(0,1fr)] items-center gap-3 border-b border-line py-2 last:border-b-0 sm:grid-cols-[minmax(0,12rem)_minmax(0,1fr)_4.5rem]"
            >
              <div className="min-w-0">
                <div className="flex items-center gap-1.5">
                  <span className="truncate text-sm font-semibold">{method.label}</span>
                  {method.baseline ? (
                    <Badge tone="neutral" dashed className="hidden sm:inline-flex">
                      control
                    </Badge>
                  ) : null}
                </div>
                <div className="font-terminal text-xs text-muted tabular-nums">
                  n={spread.n}
                  {spread.mean === null ? "" : `, mean ${fmt(spread.mean)}`}
                  {method.pending > 0 ? `, ${method.pending} to go` : ""}
                </div>
              </div>

              <div className="relative h-9" title={`${method.label}: median ${fmt(spread.median)}`}>
                {axis.map((value) => (
                  <span
                    key={value}
                    aria-hidden
                    className={`absolute inset-y-0 w-px ${value === 0 ? "bg-foreground/25" : "bg-line"}`}
                    style={{ left: `${at(value)}%` }}
                  />
                ))}
                {spread.min !== null && spread.max !== null ? (
                  <span
                    aria-hidden
                    className="absolute top-1/2 h-px -translate-y-1/2"
                    style={{
                      left: `${at(spread.min)}%`,
                      width: `${Math.max(at(spread.max) - at(spread.min), 0.3)}%`,
                      background: c,
                      opacity: 0.6,
                    }}
                  />
                ) : null}
                {spread.q1 !== null && spread.q3 !== null ? (
                  <span
                    aria-hidden
                    className={`absolute top-1/2 h-4 -translate-y-1/2 rounded-[3px] border ${method.baseline ? "border-dashed" : ""}`}
                    style={{
                      left: `${at(spread.q1)}%`,
                      width: `${Math.max(at(spread.q3) - at(spread.q1), 0.6)}%`,
                      borderColor: c,
                      background: `color-mix(in srgb, ${c} 22%, transparent)`,
                    }}
                  />
                ) : null}
                {method.reductions.map((value, index) => (
                  <span
                    key={index}
                    title={`${method.label}: ${value.toFixed(1)}%`}
                    className="absolute size-1.5 -translate-x-1/2 -translate-y-1/2 rounded-full ring-1 ring-surface"
                    style={{
                      left: `${at(value)}%`,
                      top: `${50 + jitter(index) * 32}%`,
                      background: c,
                      opacity: 0.85,
                    }}
                  />
                ))}
                {spread.median !== null ? (
                  <span
                    aria-hidden
                    className="absolute top-1/2 h-6 w-0.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-foreground"
                    style={{ left: `${at(spread.median)}%` }}
                  />
                ) : null}
                {spread.n === 0 ? (
                  <span className="absolute inset-0 flex items-center text-xs text-muted">
                    {method.pending > 0 ? "waiting for runs" : "no finished runs"}
                  </span>
                ) : null}
              </div>

              <div className="hidden text-right font-terminal text-sm tabular-nums sm:block">
                {fmt(spread.median)}
              </div>
            </div>
          );
        })}
      </div>

      <div className="grid grid-cols-[minmax(0,8.5rem)_minmax(0,1fr)] gap-3 pt-1 sm:grid-cols-[minmax(0,12rem)_minmax(0,1fr)_4.5rem]">
        <span />
        <div className="relative h-5">
          {axis.map((value) => (
            <span
              key={value}
              className="absolute -translate-x-1/2 font-terminal text-xs text-muted tabular-nums"
              style={{ left: `${at(value)}%` }}
            >
              {value}%
            </span>
          ))}
        </div>
        <span className="hidden text-right text-xs text-muted sm:block">median</span>
      </div>
      <figcaption className="mt-3 text-xs leading-relaxed text-muted">
        Cost reduction per run. Box: middle half of runs. Line: full range. Tick: median. Colour
        ranks methods by median, violet lowest to green highest. Dashed boxes are controls.
      </figcaption>
    </figure>
  );
}
