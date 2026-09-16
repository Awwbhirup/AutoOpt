"use client";

/**
 * The run's own cost, built in depth as it happens.
 *
 * Each proposal is a slab standing on a receding floor. A proposal that lowered
 * the weighted cost is a tall post in the kept colour and pulls the ribbon down
 * behind it; one that landed exactly where it started is a flat plate in the
 * refused colour, because that is what the numbers say. Five of the eleven here
 * are plates, and that is the claim the page makes, drawn rather than asserted.
 *
 * Same projection and same ramp as the ridgeline further down, so the two read
 * as one instrument rather than two charts that happen to share a page.
 *
 * Slabs arrive as the replay reaches them, each easing up from the floor rather
 * than appearing, and the ribbon grows to meet them. Nothing on it pops.
 */

import { useCallback, useEffect, useRef, useState } from "react";

import { css, easeOutCubic, KEPT, mix, REFUSED, type Rgb } from "./ramp";

export interface Slab {
  before: number;
  after: number;
  improved: boolean;
  label: string;
  site: number | null;
}

const VIEW = {
  /** Reference box. Everything scales off the real width. */
  width: 520,
  height: 230,
  padLeft: 46,
  padBottom: 46,
  padTop: 26,
  /** How far each slab behind the last steps right and up. */
  depthX: 15,
  depthY: -11,
  slabWidth: 15,
};

const MAX_DPR = 2;
/** How long one slab takes to rise once the replay has reached it. */
const RISE_MS = 520;

export function RunTrajectory3D({
  slabs,
  total,
  className,
}: {
  /** What has arrived so far. */
  slabs: Slab[];
  /** Every slab the finished run will have, which fixes the scene up front. */
  total: Slab[];
  className?: string;
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const [hovered, setHovered] = useState<number | null>(null);

  // Read by the draw loop rather than by React, so pointer movement never
  // queues a render. Only the hovered slab does, because only it changes text.
  const pointer = useRef({ x: 0.5, y: 0.5, inside: false });
  const tilt = useRef({ x: 0.5, y: 0.5 });
  const hoveredRef = useRef<number | null>(null);
  const arrivedAt = useRef<number[]>([]);
  const shown = useRef(0);

  // Written in an effect rather than during render. The draw loop reads it every
  // frame and must not be the reason a render has a side effect.
  useEffect(() => {
    shown.current = slabs.length;
  }, [slabs.length]);

  const setHover = useCallback((next: number | null) => {
    if (hoveredRef.current === next) return;
    hoveredRef.current = next;
    setHovered(next);
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (canvas === null || total.length === 0) return;
    const context = canvas.getContext("2d");
    if (context === null) return;

    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)");
    let raf = 0;
    let width = VIEW.width;
    let height = VIEW.height;

    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, MAX_DPR);
      width = Math.max(1, rect.width);
      height = Math.max(1, rect.height);
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
      context.setTransform(dpr, 0, 0, dpr, 0, 0);
    };

    const values = total.flatMap((slab) => [slab.before, slab.after]);
    const high = Math.max(...values);
    const low = Math.min(...values);
    const span = high - low || 1;
    const ceiling = high + span * 0.18;
    const floor = low - span * 0.3;

    const render = (now: number) => {
      const scaleX = width / VIEW.width;
      const scaleY = height / VIEW.height;

      // Negated, so moving the pointer right swings the scene as though you had
      // stepped to the right of it. Following the pointer directly reads as the
      // object running away from the cursor, which is what it was doing.
      const target = pointer.current.inside ? pointer.current : { x: 0.5, y: 0.5 };
      tilt.current.x += (target.x - tilt.current.x) * 0.07;
      tilt.current.y += (target.y - tilt.current.y) * 0.07;
      const depthX = (VIEW.depthX - (tilt.current.x - 0.5) * 16) * scaleX;
      const depthY = (VIEW.depthY + (tilt.current.y - 0.5) * 12) * scaleY;

      const laneWidth =
        (width - VIEW.padLeft * scaleX - 30 * scaleX - depthX * (total.length - 1)) /
        Math.max(1, total.length);
      const usableHeight = height - (VIEW.padBottom + VIEW.padTop) * scaleY;
      const yOf = (value: number) =>
        VIEW.padTop * scaleY + ((ceiling - value) / (ceiling - floor)) * usableHeight;
      const xOf = (index: number) =>
        VIEW.padLeft * scaleX + index * laneWidth + index * depthX;
      const zOf = (index: number) => index * depthY;

      context.clearRect(0, 0, width, height);

      // Floor, receding. There to say the slabs stand on something.
      context.strokeStyle = "rgba(125, 134, 148, 0.14)";
      context.lineWidth = 1;
      for (let i = 0; i <= total.length; i += 1) {
        context.beginPath();
        context.moveTo(xOf(i), yOf(floor) + zOf(i));
        context.lineTo(xOf(i) + laneWidth * 0.82, yOf(floor) + zOf(i));
        context.stroke();
      }

      // Back to front, so a nearer slab covers the one behind it.
      for (let i = total.length - 1; i >= 0; i -= 1) {
        const slab = total[i];
        const isShown = i < shown.current;
        if (!isShown) {
          arrivedAt.current[i] = 0;
          continue;
        }
        if (!arrivedAt.current[i]) arrivedAt.current[i] = now;
        const rise = reduced.matches
          ? 1
          : easeOutCubic(Math.min(1, (now - arrivedAt.current[i]) / RISE_MS));

        const isHovered = hoveredRef.current === i;
        const dimmed = hoveredRef.current !== null && !isHovered;
        const base: Rgb = slab.improved ? KEPT : REFUSED;
        // Further back washes toward the page colour: air between the rows.
        const depthFade = 1 - (i / total.length) * 0.3;
        const colour = dimmed ? mix(base, { r: 125, g: 134, b: 148 }, 0.72) : base;

        const x = xOf(i);
        const z = zOf(i);
        const w = Math.max(6, Math.min(VIEW.slabWidth * scaleX, laneWidth * 0.66));
        const d = Math.max(4, depthX * 0.72);

        const topValue = slab.before + (slab.after - slab.before) * rise;
        const yTop = yOf(Math.max(slab.after, topValue)) + z;
        const yBottom = yOf(floor) + z;
        const yStart = yOf(slab.before) + z;

        if (slab.improved) {
          // Front face.
          const face = context.createLinearGradient(0, yTop, 0, yBottom);
          face.addColorStop(0, css(colour, 0.92 * depthFade));
          face.addColorStop(1, css(colour, 0.12 * depthFade));
          context.fillStyle = face;
          context.fillRect(x, yTop, w, yBottom - yTop);

          // Top face, which is what makes it a solid rather than a bar.
          context.fillStyle = css(mix(colour, { r: 255, g: 255, b: 255 }, 0.4), 0.9 * depthFade);
          context.beginPath();
          context.moveTo(x, yTop);
          context.lineTo(x + d, yTop + depthY * 0.7);
          context.lineTo(x + w + d, yTop + depthY * 0.7);
          context.lineTo(x + w, yTop);
          context.closePath();
          context.fill();

          // Side face, darker, so the light has a direction.
          context.fillStyle = css(mix(colour, { r: 0, g: 0, b: 0 }, 0.45), 0.85 * depthFade);
          context.beginPath();
          context.moveTo(x + w, yTop);
          context.lineTo(x + w + d, yTop + depthY * 0.7);
          context.lineTo(x + w + d, yBottom + depthY * 0.7);
          context.lineTo(x + w, yBottom);
          context.closePath();
          context.fill();

          if (!dimmed) {
            context.save();
            context.shadowBlur = isHovered ? 26 : 13;
            context.shadowColor = css(colour);
            context.strokeStyle = css(colour, 0.95);
            context.lineWidth = isHovered ? 2 : 1.1;
            context.strokeRect(x, yTop, w, yBottom - yTop);
            context.restore();
          }
        } else {
          // A plate at the level it started and ended on. No height, because
          // there is no change to draw; a minimum bar would invent one.
          const plateY = yStart;
          context.save();
          if (!dimmed) {
            context.shadowBlur = isHovered ? 22 : 11;
            context.shadowColor = css(colour);
          }
          context.fillStyle = css(colour, (isHovered ? 0.95 : 0.8) * depthFade);
          context.beginPath();
          context.moveTo(x, plateY);
          context.lineTo(x + d, plateY + depthY * 0.7);
          context.lineTo(x + w + d, plateY + depthY * 0.7);
          context.lineTo(x + w, plateY);
          context.closePath();
          context.fill();
          context.restore();
        }
      }

    };

    const loop = (now: number) => {
      render(now);
      raf = window.requestAnimationFrame(loop);
    };

    resize();
    // One frame straight away, before any animation frame is asked for.
    // requestAnimationFrame does not fire while the tab is hidden or the window
    // is occluded, and a chart that only ever paints inside it is a blank box
    // until the reader happens to look at it.
    render(performance.now());
    raf = window.requestAnimationFrame(loop);
    const onResize = () => {
      resize();
      render(performance.now());
    };
    window.addEventListener("resize", onResize);
    return () => {
      window.cancelAnimationFrame(raf);
      window.removeEventListener("resize", onResize);
    };
  }, [total]);

  const onPointerMove = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      const element = wrapRef.current;
      if (element === null || total.length === 0) return;
      const rect = element.getBoundingClientRect();
      const x = (event.clientX - rect.left) / rect.width;
      pointer.current = {
        x,
        y: (event.clientY - rect.top) / rect.height,
        inside: true,
      };
      // By lane across the width, which is what the reader is aiming at.
      const lane = Math.floor(x * total.length);
      const index = Math.max(0, Math.min(total.length - 1, lane));
      setHover(index < slabs.length ? index : null);
    },
    [setHover, slabs.length, total.length],
  );

  const onPointerLeave = useCallback(() => {
    pointer.current = { x: 0.5, y: 0.5, inside: false };
    setHover(null);
  }, [setHover]);

  const active = hovered === null ? null : total[hovered];

  return (
    <figure className={className}>
      <div
        ref={wrapRef}
        onPointerMove={onPointerMove}
        onPointerLeave={onPointerLeave}
        className="relative touch-none"
      >
        <canvas
          ref={canvasRef}
          className="h-[230px] w-full"
          role="img"
          aria-label={`Weighted cost of each proposal in the run. ${
            total.filter((s) => s.improved).length
          } lowered it, ${total.filter((s) => !s.improved).length} left it exactly where it was.`}
        />

        <div
          className="pointer-events-none absolute right-0 top-0 min-w-[10rem] rounded-lg border border-line bg-raised/90 px-3 py-2 font-terminal text-[0.66rem] backdrop-blur transition-opacity duration-200"
          style={{ opacity: active ? 1 : 0 }}
        >
          <div className="text-foreground">{active ? active.label : ""}</div>
          <div
            className="mt-1 tabular-nums"
            style={{ color: active?.improved ? css(KEPT) : css(REFUSED) }}
          >
            {active ? `${active.before.toFixed(4)} -> ${active.after.toFixed(4)}` : ""}
          </div>
          <div className="tabular-nums text-muted">
            {active ? (active.improved ? "kept" : "no cost improvement") : ""}
          </div>
        </div>
      </div>

      <figcaption className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 font-terminal text-[0.68rem] text-muted">
        <span className="flex items-center gap-1.5">
          <span
            aria-hidden
            className="h-2.5 w-1 rounded-sm"
            style={{ background: css(KEPT), boxShadow: `0 0 7px ${css(KEPT)}` }}
          />
          lowered the cost
        </span>
        <span className="flex items-center gap-1.5">
          <span
            aria-hidden
            className="h-1 w-2.5 rounded-sm"
            style={{ background: css(REFUSED), boxShadow: `0 0 7px ${css(REFUSED)}` }}
          />
          moved it by nothing
        </span>
        <span className="ml-auto tabular-nums text-foreground">
          {slabs.length}/{total.length}
        </span>
      </figcaption>
    </figure>
  );
}
