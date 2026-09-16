"use client";

/**
 * What every proposal in the run would have cost, drawn as the run happens.
 *
 * One column per costed proposal on a shared cost axis. A proposal that lowered
 * the weighted cost falls, drawn in the colour this product already uses for a
 * rewrite that was kept. A proposal that landed exactly where it started gets a
 * flat mark, because that is what the numbers say: five of these eleven moved
 * the cost by nothing at all. That flatness is the argument the page makes, and
 * drawn against the ones that did fall it is visible in a single look.
 *
 * Nothing here appears. The whole chart is drawn once at its final extent and
 * then revealed by a mask whose edge sweeps left to right, so a column is
 * uncovered rather than inserted, and the reveal is one continuous movement
 * instead of eleven small ones. The edge is a spring rather than a value that
 * jumps per tick, which is what takes the step out of playback's 230ms clock.
 *
 * The axis is fixed from the finished recording rather than from what is on
 * screen. The run is already over and already known, so rescaling as columns
 * arrive would make earlier ones drift while the data behind them had not
 * changed, which is a chart lying about its own history.
 */

import {
  AnimatePresence,
  motion,
  useReducedMotion,
  useSpring,
  useTransform,
} from "motion/react";
import { useEffect, useMemo, useState } from "react";

import type { TraceStep } from "@/lib/trace";

const WIDTH = 340;
const HEIGHT = 128;
const PAD = { top: 18, right: 14, bottom: 26, left: 38 };

export interface Column {
  before: number;
  after: number;
  improved: boolean;
  label: string;
  site: number | null;
}

/** Every costed proposal in a folded trace, in order. */
export function columnsOf(steps: TraceStep[]): Column[] {
  const columns: Column[] = [];
  for (const step of steps) {
    if (step.cost === null) continue;
    columns.push({
      before: step.cost.before.weighted_total,
      after: step.cost.after.weighted_total,
      improved: step.cost.improved,
      label: step.optimizationType.replace(/_/g, " "),
      site: step.site,
    });
  }
  return columns;
}

export function CostTrajectory({
  columns,
  total,
  className,
}: {
  /** What has arrived so far. Only its length is used, to place the sweep. */
  columns: Column[];
  /** Every column the finished run will have. The chart is drawn from this. */
  total: Column[];
  className?: string;
}) {
  const reduced = useReducedMotion();
  const [hovered, setHovered] = useState<number | null>(null);

  const scale = useMemo(() => {
    const values = total.flatMap((column) => [column.before, column.after]);
    const high = values.length ? Math.max(...values) : 1;
    const low = values.length ? Math.min(...values) : 0;
    const span = high - low || 1;
    const ceiling = high + span * 0.16;
    const floor = low - span * 0.16;
    return {
      ceiling,
      floor,
      levels: [...new Set(total.map((column) => column.before))].sort((a, b) => b - a),
      y: (value: number) =>
        PAD.top + ((ceiling - value) / (ceiling - floor)) * (HEIGHT - PAD.top - PAD.bottom),
      x: (index: number) =>
        total.length <= 1
          ? (WIDTH - PAD.left - PAD.right) / 2 + PAD.left
          : PAD.left + (index / (total.length - 1)) * (WIDTH - PAD.left - PAD.right),
    };
  }, [total]);

  const step = total.length > 1 ? scale.x(1) - scale.x(0) : WIDTH;

  // Where the sweep should be. A column is uncovered once the edge has passed
  // it by half a column, so the mark is fully out before the edge moves on.
  const target =
    columns.length === 0
      ? PAD.left - 2
      : Math.min(scale.x(columns.length - 1) + step * 0.55, WIDTH);

  const edge = useSpring(target, {
    stiffness: reduced ? 1000 : 90,
    damping: reduced ? 100 : 22,
    mass: 0.8,
  });
  useEffect(() => {
    edge.set(target);
  }, [edge, target]);

  const revealWidth = useTransform(edge, (value) => Math.max(0, value));
  const glowOpacity = useTransform(edge, [PAD.left, WIDTH], [0.35, 0.8]);

  if (total.length === 0) return null;

  // Drawn at full extent, once. The mask decides what is visible.
  const committed = total
    .map((column, index) => `${index === 0 ? "M" : "L"} ${scale.x(index)} ${scale.y(column.before)}`)
    .join(" ");
  const area = `${committed} L ${scale.x(total.length - 1)} ${scale.y(scale.floor)} L ${scale.x(0)} ${scale.y(scale.floor)} Z`;
  const best = Math.min(...total.map((column) => column.after));

  const active = hovered !== null ? total[hovered] : null;
  const arrived = columns.length;

  return (
    <figure className={className}>
      <div className="relative">
        <svg
          viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
          className="w-full"
          style={{ height: "auto", overflow: "visible" }}
          role="img"
          aria-label={`Weighted cost of each proposal. ${
            total.filter((c) => c.improved).length
          } lowered it, ${total.filter((c) => !c.improved).length} left it exactly where it was.`}
        >
          <defs>
            <linearGradient id="ct-area" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--accent)" stopOpacity="0.28" />
              <stop offset="55%" stopColor="var(--accent)" stopOpacity="0.07" />
              <stop offset="100%" stopColor="var(--accent)" stopOpacity="0" />
            </linearGradient>

            <linearGradient id="ct-kept" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#8ffcc9" />
              <stop offset="100%" stopColor="var(--accent)" />
            </linearGradient>

            {/* The glow. Blur a copy, lay the crisp original back over it: the
                stroke stays readable and the light comes off the sides. */}
            <filter id="ct-glow" x="-60%" y="-60%" width="220%" height="220%">
              <feGaussianBlur stdDeviation="2.4" result="blur" />
              <feMerge>
                <feMergeNode in="blur" />
                <feMergeNode in="blur" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>

            <filter id="ct-soft" x="-60%" y="-60%" width="220%" height="220%">
              <feGaussianBlur stdDeviation="4" />
            </filter>

            <motion.mask id="ct-reveal">
              <motion.rect
                x={0}
                y={-20}
                width={revealWidth}
                height={HEIGHT + 40}
                fill="#fff"
              />
            </motion.mask>
          </defs>

          {/* Levels the run actually took, not a prettier round set. */}
          {scale.levels.map((value) => (
            <line
              key={value}
              x1={PAD.left}
              y1={scale.y(value)}
              x2={WIDTH - PAD.right}
              y2={scale.y(value)}
              stroke="var(--border)"
              strokeWidth={0.5}
            />
          ))}
          {scale.levels.map((value) => (
            <text
              key={`label-${value}`}
              x={PAD.left - 6}
              y={scale.y(value) + 2.6}
              textAnchor="end"
              className="fill-[var(--muted)] font-terminal"
              style={{ fontSize: 7 }}
            >
              {value.toFixed(2)}
            </text>
          ))}

          <g mask="url(#ct-reveal)">
            <path d={area} fill="url(#ct-area)" />

            {/* Depth: a blurred copy under the line reads as the light it is
                throwing onto the surface behind it. */}
            <path
              d={committed}
              fill="none"
              stroke="var(--accent)"
              strokeWidth={3}
              strokeOpacity={0.25}
              strokeLinejoin="round"
              filter="url(#ct-soft)"
            />
            <path
              d={committed}
              fill="none"
              stroke="var(--muted)"
              strokeWidth={1}
              strokeDasharray="3 3"
              strokeLinejoin="round"
              vectorEffect="non-scaling-stroke"
            />

            {total.map((column, index) =>
              column.improved ? (
                <g
                  key={`kept-${index}`}
                  filter="url(#ct-glow)"
                  onMouseEnter={() => setHovered(index)}
                  onMouseLeave={() => setHovered(null)}
                >
                  <line
                    x1={scale.x(index)}
                    y1={scale.y(column.before)}
                    x2={scale.x(index)}
                    y2={scale.y(column.after)}
                    stroke="url(#ct-kept)"
                    strokeWidth={hovered === index ? 4 : 2.4}
                    strokeLinecap="round"
                    className="transition-[stroke-width] duration-150"
                  />
                  <circle
                    cx={scale.x(index)}
                    cy={scale.y(column.after)}
                    r={hovered === index ? 3.8 : 2.8}
                    fill="#c9ffe8"
                    className="transition-[r] duration-150"
                  />
                </g>
              ) : (
                // No line, because there is no distance to draw. A bar with a
                // minimum height here would be inventing a change.
                <line
                  key={`flat-${index}`}
                  x1={scale.x(index) - 4.5}
                  y1={scale.y(column.before)}
                  x2={scale.x(index) + 4.5}
                  y2={scale.y(column.before)}
                  stroke="var(--refused)"
                  strokeWidth={hovered === index ? 4 : 2.4}
                  strokeLinecap="round"
                  filter="url(#ct-glow)"
                  onMouseEnter={() => setHovered(index)}
                  onMouseLeave={() => setHovered(null)}
                  className="transition-[stroke-width] duration-150"
                />
              ),
            )}

            <line
              x1={PAD.left}
              x2={WIDTH - PAD.right}
              y1={scale.y(best)}
              y2={scale.y(best)}
              stroke="var(--accent)"
              strokeWidth={0.75}
              strokeOpacity={0.5}
              strokeDasharray="1 3"
            />
          </g>

          {/* The sweep's own edge, so the reveal has a light source rather than
              an invisible boundary. Hidden once it has run off the end. */}
          {arrived < total.length ? (
            <motion.g style={{ x: edge, opacity: glowOpacity }}>
              <line
                x1={0}
                y1={PAD.top - 10}
                x2={0}
                y2={HEIGHT - PAD.bottom + 6}
                stroke="var(--accent)"
                strokeWidth={6}
                strokeOpacity={0.14}
                filter="url(#ct-soft)"
              />
              <line
                x1={0}
                y1={PAD.top - 10}
                x2={0}
                y2={HEIGHT - PAD.bottom + 6}
                stroke="#c9ffe8"
                strokeWidth={0.8}
                strokeOpacity={0.7}
              />
            </motion.g>
          ) : null}
        </svg>

        {/* Readout rather than a floating tooltip: the chart is small and a box
            that followed the pointer would cover the columns beside the one
            being read. */}
        <div className="pointer-events-none absolute right-0 top-0 font-terminal text-[0.65rem] leading-tight">
          <AnimatePresence mode="wait">
            {active ? (
              <motion.div
                key={hovered}
                initial={reduced ? false : { opacity: 0, y: -4, filter: "blur(4px)" }}
                animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
                exit={reduced ? undefined : { opacity: 0, filter: "blur(4px)" }}
                transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
                className="rounded border border-line bg-raised/95 px-2 py-1 text-right backdrop-blur"
              >
                <div className="text-foreground">{active.label}</div>
                <div className={active.improved ? "text-accent" : "text-refused"}>
                  {active.before.toFixed(4)} {"->"} {active.after.toFixed(4)}
                </div>
              </motion.div>
            ) : null}
          </AnimatePresence>
        </div>
      </div>

      <figcaption className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 font-terminal text-[0.65rem] text-muted">
        <span className="flex items-center gap-1.5">
          <span
            aria-hidden
            className="h-2.5 w-0.5 rounded-full bg-accent shadow-[0_0_6px_var(--accent)]"
          />
          lowered the cost
        </span>
        <span className="flex items-center gap-1.5">
          <span
            aria-hidden
            className="h-0.5 w-2.5 rounded-full bg-refused shadow-[0_0_6px_var(--refused)]"
          />
          moved it by nothing
        </span>
        <span className="ml-auto tabular-nums text-foreground">
          {arrived}/{total.length} proposals
        </span>
      </figcaption>
    </figure>
  );
}
