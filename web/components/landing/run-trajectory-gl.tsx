"use client";

/**
 * The run chart: the WebGL scene where the browser can draw it, the canvas
 * version where it cannot. Tooltip and caption are DOM, shared by both paths.
 */

import dynamic from "next/dynamic";
import { useEffect, useState } from "react";

import { css, KEPT, REFUSED } from "./ramp";
import { RunTrajectory3D, type Slab } from "./run-trajectory-3d";
import { supportsWebGL } from "./webgl";

const TrajectoryScene = dynamic(() => import("./trajectory-scene"), {
  ssr: false,
  loading: () => <div className="h-[248px] w-full" />,
});

export function RunTrajectoryGL({
  slabs,
  total,
  className,
}: {
  slabs: Slab[];
  total: Slab[];
  className?: string;
}) {
  const [webgl, setWebgl] = useState<boolean | null>(null);
  const [hovered, setHovered] = useState<number | null>(null);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setWebgl(supportsWebGL());
  }, []);

  if (webgl === false) return <RunTrajectory3D slabs={slabs} total={total} className={className} />;

  // Only a slab the replay has reached can be described.
  const active = hovered !== null && hovered < slabs.length ? total[hovered] : null;

  return (
    <figure className={className}>
      <div
        className="relative"
        role="img"
        aria-label={`Weighted cost of each proposal in the run. ${
          total.filter((s) => s.improved).length
        } lowered it, ${total.filter((s) => !s.improved).length} left it exactly where it was.`}
      >
        {webgl === null ? (
          <div className="h-[248px] w-full" />
        ) : (
          <TrajectoryScene
            slabs={slabs}
            total={total}
            hovered={active ? hovered : null}
            onHover={setHovered}
            className="h-[248px] w-full touch-none"
          />
        )}

        <div
          className="pointer-events-none absolute right-0 top-0 min-w-[10rem] rounded-lg border border-line bg-raised/90 px-3 py-2 font-terminal text-[0.78rem] backdrop-blur transition-opacity duration-200"
          style={{ opacity: active ? 1 : 0 }}
        >
          <div className="text-foreground">{active ? active.label : ""}</div>
          <div className="mt-1 tabular-nums" style={{ color: active?.improved ? css(KEPT) : css(REFUSED) }}>
            {active ? `${active.before.toFixed(4)} -> ${active.after.toFixed(4)}` : ""}
          </div>
          <div className="tabular-nums text-muted">
            {active ? (active.improved ? "kept" : "no cost improvement") : ""}
          </div>
        </div>
      </div>

      <figcaption className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 font-terminal text-[0.8rem] text-muted">
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
