"use client";

/**
 * Every method's cost reduction, all four thousand runs, as a ridgeline.
 *
 * Eight ridges, back to front: the three search methods that can cross a
 * cost-neutral state, the three that cannot, and the two LLM arms. They land in
 * three tiers because they are three tiers, and a Tukey HSD on the same data
 * separates exactly those groups. The colour is the ramp from lib, applied by
 * rank, so hue carries the result rather than being picked to look like a
 * gradient.
 *
 * Canvas rather than SVG. Eight ridges of seventy-two points each, redrawn
 * every frame with a glow pass under them, is around twelve hundred filled and
 * stroked segments a frame; as SVG that is twelve hundred DOM nodes being
 * re-laid-out, and the tilt would stutter the moment the pointer moved.
 *
 * The projection is oblique rather than a perspective camera. A ridgeline is
 * read by comparing heights across rows, and perspective makes the far rows
 * shorter for a reason that has nothing to do with the data. Depth is carried
 * by offset, occlusion and haze instead, all three of which are honest here.
 *
 * Nothing animates unprompted once it has settled except a very slow breathing
 * of the surface, and all of it stops under prefers-reduced-motion.
 */

import { useCallback, useEffect, useRef, useState } from "react";

import { AXIS, RIDGES, type MethodRidge } from "@/lib/method-ridges";

const RAMP = ["#8b5cf6", "#5b7cfa", "#2aa8f2", "#1fd4c3", "#3ef2a0"];

/** Oblique projection, in canvas units before the device ratio is applied. */
const VIEW = {
  width: 640,
  height: 340,
  /** How far each ridge behind the last steps right and up. */
  depthX: 26,
  depthY: -21,
  /** Peak height of a fully saturated ridge. */
  amplitude: 84,
  padLeft: 74,
  padBottom: 78,
};

const ENTRANCE_MS = 1700;
const MAX_DPR = 2;

interface Rgb {
  r: number;
  g: number;
  b: number;
}

function hexToRgb(hex: string): Rgb {
  return {
    r: parseInt(hex.slice(1, 3), 16),
    g: parseInt(hex.slice(3, 5), 16),
    b: parseInt(hex.slice(5, 7), 16),
  };
}

/**
 * The ramp, sampled at a ridge's rank.
 *
 * Returns components rather than a string, because the draw loop needs the same
 * colour at several opacities per frame and assembling those by string surgery
 * on an rgb() is how one of them ends up malformed and silently transparent.
 */
function rampAt(index: number, count: number): Rgb {
  if (count <= 1) return hexToRgb(RAMP[RAMP.length - 1]);
  const position = (index / (count - 1)) * (RAMP.length - 1);
  const low = Math.floor(position);
  const high = Math.min(low + 1, RAMP.length - 1);
  const t = position - low;
  const a = hexToRgb(RAMP[low]);
  const b = hexToRgb(RAMP[high]);
  return {
    r: Math.round(a.r + (b.r - a.r) * t),
    g: Math.round(a.g + (b.g - a.g) * t),
    b: Math.round(a.b + (b.b - a.b) * t),
  };
}

const css = ({ r, g, b }: Rgb, alpha = 1) =>
  alpha >= 1 ? `rgb(${r}, ${g}, ${b})` : `rgba(${r}, ${g}, ${b}, ${alpha})`;

/** For the DOM side, which only ever wants it opaque. */
function colourFor(index: number, count: number): string {
  return css(rampAt(index, count));
}

function easeOutCubic(t: number): number {
  return 1 - Math.pow(1 - t, 3);
}

function label(method: string): string {
  return method.replace(/_/g, " ");
}

export function MethodRidgeline({ className }: { className?: string }) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const [hovered, setHovered] = useState<number | null>(null);

  // Read by the draw loop rather than by React, so pointer movement and the
  // breathing never queue a render. Only the hovered ridge does, because only
  // that changes text.
  const pointer = useRef({ x: 0.5, y: 0.5, inside: false });
  const tilt = useRef({ x: 0.5, y: 0.5 });
  const hoveredRef = useRef<number | null>(null);

  const setHover = useCallback((next: number | null) => {
    if (hoveredRef.current === next) return;
    hoveredRef.current = next;
    setHovered(next);
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (canvas === null) return;
    const context = canvas.getContext("2d");
    if (context === null) return;

    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)");
    let raf = 0;
    let start = 0;
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

    /** Where a sample lands, given the ridge it is on and the current tilt. */
    const project = (
      ridgeIndex: number,
      sampleIndex: number,
      value: number,
      scaleX: number,
      depthX: number,
      depthY: number,
      amplitude: number,
    ) => {
      const t = sampleIndex / (AXIS.length - 1);
      return {
        x: VIEW.padLeft * scaleX + t * (width - VIEW.padLeft * scaleX - 40) + ridgeIndex * depthX,
        y: height - VIEW.padBottom + ridgeIndex * depthY - value * amplitude,
      };
    };

    const draw = (now: number) => {
      if (start === 0) start = now;
      const elapsed = now - start;
      const entrance = reduced.matches
        ? 1
        : easeOutCubic(Math.min(1, elapsed / ENTRANCE_MS));

      // The tilt eases toward the pointer instead of tracking it, so a fast
      // mouse does not whip the scene around.
      const target = pointer.current.inside ? pointer.current : { x: 0.5, y: 0.5 };
      tilt.current.x += (target.x - tilt.current.x) * 0.06;
      tilt.current.y += (target.y - tilt.current.y) * 0.06;

      const scaleX = width / VIEW.width;
      const scaleY = height / VIEW.height;
      const depthX = (VIEW.depthX + (tilt.current.x - 0.5) * 26) * scaleX;
      const depthY = (VIEW.depthY - (tilt.current.y - 0.5) * 18) * scaleY;
      const amplitude = VIEW.amplitude * scaleY;

      context.clearRect(0, 0, width, height);

      // Floor. Drawn first and dimly: it is there to say the ridges sit on
      // something, not to be read.
      context.save();
      context.strokeStyle = "rgba(125, 134, 148, 0.16)";
      context.lineWidth = 1;
      for (let i = 0; i <= 6; i += 1) {
        const t = i / 6;
        const a = project(0, Math.round(t * (AXIS.length - 1)), 0, scaleX, depthX, depthY, amplitude);
        const b = project(
          RIDGES.length - 1,
          Math.round(t * (AXIS.length - 1)),
          0,
          scaleX,
          depthX,
          depthY,
          amplitude,
        );
        context.beginPath();
        context.moveTo(a.x, a.y);
        context.lineTo(b.x, b.y);
        context.stroke();
      }
      context.restore();

      // Back to front, so a nearer ridge covers the one behind it. That
      // occlusion is the whole of the depth cue; without it this is eight
      // curves on top of each other.
      for (let r = RIDGES.length - 1; r >= 0; r -= 1) {
        const ridge: MethodRidge = RIDGES[r];
        const colour = rampAt(r, RIDGES.length);
        const isHovered = hoveredRef.current === r;
        const dimmed = hoveredRef.current !== null && !isHovered;

        // Ridges arrive back to front, each a little after the one behind it.
        const stagger = (RIDGES.length - 1 - r) / RIDGES.length;
        const local = Math.max(0, Math.min(1, (entrance - stagger * 0.45) / 0.55));
        if (local <= 0) continue;

        // The breathing. Tiny, slow, and out of phase per ridge so the surface
        // never pulses as one thing.
        const breath = reduced.matches
          ? 1
          : 1 + Math.sin(now / 2600 + r * 0.9) * 0.022;

        const points = ridge.density.map((value, i) =>
          project(r, i, value * local * breath, scaleX, depthX, depthY, amplitude),
        );
        const left = project(r, 0, 0, scaleX, depthX, depthY, amplitude);
        const right = project(r, AXIS.length - 1, 0, scaleX, depthX, depthY, amplitude);

        const outline = new Path2D();
        outline.moveTo(left.x, left.y);
        for (const point of points) outline.lineTo(point.x, point.y);
        outline.lineTo(right.x, right.y);

        const filled = new Path2D(outline);
        filled.closePath();

        // Haze: the further back, the more the fill washes toward the page
        // colour. Reads as air between the rows.
        const depthFade = 1 - (r / RIDGES.length) * 0.35;
        const gradient = context.createLinearGradient(0, left.y - amplitude, 0, left.y);
        gradient.addColorStop(0, css(colour, (dimmed ? 0.1 : 0.42) * depthFade));
        gradient.addColorStop(1, "rgba(7, 8, 11, 0.94)");
        context.fillStyle = gradient;
        context.fill(filled);

        context.save();
        if (!dimmed) {
          context.shadowBlur = isHovered ? 26 : 14;
          context.shadowColor = css(colour);
        }
        context.strokeStyle = dimmed ? "rgba(125, 134, 148, 0.28)" : css(colour);
        context.lineWidth = isHovered ? 2.4 : 1.5;
        context.lineJoin = "round";
        context.stroke(outline);
        context.restore();
      }

      raf = window.requestAnimationFrame(draw);
    };

    resize();
    raf = window.requestAnimationFrame(draw);

    const onResize = () => resize();
    window.addEventListener("resize", onResize);
    return () => {
      window.cancelAnimationFrame(raf);
      window.removeEventListener("resize", onResize);
    };
  }, []);

  // Which ridge is under the pointer, by the band of screen height it owns.
  // Cheaper and steadier than hit-testing eight filled paths every move, and
  // the bands are what a reader is aiming at anyway.
  const onPointerMove = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      const element = wrapRef.current;
      if (element === null) return;
      const rect = element.getBoundingClientRect();
      const x = (event.clientX - rect.left) / rect.width;
      const y = (event.clientY - rect.top) / rect.height;
      pointer.current = { x, y, inside: true };

      const band = Math.floor(y * RIDGES.length);
      setHover(Math.max(0, Math.min(RIDGES.length - 1, band)));
    },
    [setHover],
  );

  const onPointerLeave = useCallback(() => {
    pointer.current = { x: 0.5, y: 0.5, inside: false };
    setHover(null);
  }, [setHover]);

  const active = hovered === null ? null : RIDGES[hovered];

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
          className="h-[340px] w-full"
          role="img"
          aria-label={`Cost reduction by method across ${RIDGES.reduce(
            (sum, ridge) => sum + ridge.n,
            0,
          ).toLocaleString()} runs. ${RIDGES.map(
            (ridge) => `${label(ridge.method)} averages ${(ridge.mean * 100).toFixed(1)} percent`,
          ).join(". ")}.`}
        />

        {/* Names sit in the DOM rather than on the canvas: canvas text is
            blurry at these sizes and cannot be selected or read aloud. */}
        <ul className="pointer-events-none absolute inset-y-0 left-0 flex flex-col-reverse justify-center gap-0 py-6 font-terminal text-[0.62rem]">
          {RIDGES.map((ridge, index) => (
            <li
              key={ridge.method}
              className="flex h-[26px] items-center gap-1.5 transition-opacity duration-200"
              style={{
                opacity: hovered === null || hovered === index ? 1 : 0.32,
                color: hovered === index ? colourFor(index, RIDGES.length) : "var(--muted)",
              }}
            >
              <span
                aria-hidden
                className="h-[3px] w-[3px] rounded-full"
                style={{ background: colourFor(index, RIDGES.length) }}
              />
              {label(ridge.method)}
            </li>
          ))}
        </ul>

        <div
          className="pointer-events-none absolute right-0 top-0 min-w-[9rem] rounded-lg border border-line bg-raised/90 px-3 py-2 font-terminal text-[0.66rem] backdrop-blur transition-opacity duration-200"
          style={{ opacity: active ? 1 : 0 }}
        >
          <div className="text-foreground">{active ? label(active.method) : ""}</div>
          <div className="mt-1 tabular-nums text-muted">
            mean{" "}
            <span style={{ color: hovered === null ? undefined : colourFor(hovered, RIDGES.length) }}>
              {active ? `${(active.mean * 100).toFixed(1)}%` : ""}
            </span>
          </div>
          <div className="tabular-nums text-muted">
            median {active ? `${(active.median * 100).toFixed(1)}%` : ""}
          </div>
          <div className="tabular-nums text-muted">n {active ? active.n : ""}</div>
        </div>
      </div>

      <figcaption className="mt-3 flex flex-wrap items-baseline gap-x-4 gap-y-1 font-terminal text-[0.66rem] text-muted">
        <span>cost reduction, kernel density per method</span>
        <span className="ml-auto tabular-nums text-foreground">
          {RIDGES.reduce((sum, ridge) => sum + ridge.n, 0).toLocaleString()} runs
        </span>
      </figcaption>
    </figure>
  );
}
