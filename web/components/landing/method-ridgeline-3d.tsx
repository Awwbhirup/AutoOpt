"use client";

/**
 * The ridgeline section: the WebGL scene where the browser can draw it, the
 * canvas version where it cannot. The tooltip and caption live here in the DOM
 * so they read the same either way.
 */

import dynamic from "next/dynamic";
import { useEffect, useState } from "react";

import { RIDGES } from "@/lib/method-ridges";

import { MethodRidgeline } from "./method-ridgeline";
import { css, rampAt } from "./ramp";
import { supportsWebGL } from "./webgl";

const RidgelineScene = dynamic(() => import("./ridgeline-scene"), {
  ssr: false,
  loading: () => <div className="h-[420px] w-full" />,
});

const TOTAL = RIDGES.reduce((sum, ridge) => sum + ridge.n, 0);

function label(method: string): string {
  return method.replace(/_/g, " ");
}

export function MethodRidgeline3D({ className }: { className?: string }) {
  const [webgl, setWebgl] = useState<boolean | null>(null);
  const [hovered, setHovered] = useState<number | null>(null);

  useEffect(() => {
    // Decided after mount: the server cannot know, and guessing wrong either
    // way would flash the other chart.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setWebgl(supportsWebGL());
  }, []);

  if (webgl === false) return <MethodRidgeline className={className} />;

  const active = hovered === null ? null : RIDGES[hovered];
  const colour = hovered === null ? undefined : css(rampAt(hovered, RIDGES.length));

  return (
    <figure className={className}>
      <div
        className="relative"
        role="img"
        aria-label={`Cost reduction by method across ${TOTAL.toLocaleString()} runs. ${RIDGES.map(
          (ridge) => `${label(ridge.method)} averages ${(ridge.mean * 100).toFixed(1)} percent`,
        ).join(". ")}.`}
      >
        {webgl === null ? (
          <div className="h-[420px] w-full" />
        ) : (
          <RidgelineScene hovered={hovered} onHover={setHovered} className="h-[420px] w-full touch-none" />
        )}

        <div
          className="pointer-events-none absolute right-0 top-0 min-w-[9rem] rounded-lg border border-line bg-raised/90 px-3 py-2 font-terminal text-[0.78rem] backdrop-blur transition-opacity duration-200"
          style={{ opacity: active ? 1 : 0 }}
        >
          <div className="text-foreground">{active ? label(active.method) : ""}</div>
          <div className="mt-1 tabular-nums text-muted">
            mean <span style={{ color: colour }}>{active ? `${(active.mean * 100).toFixed(1)}%` : ""}</span>
          </div>
          <div className="tabular-nums text-muted">
            median {active ? `${(active.median * 100).toFixed(1)}%` : ""}
          </div>
          <div className="tabular-nums text-muted">n {active ? active.n : ""}</div>
        </div>
      </div>

      <figcaption className="mt-3 flex flex-wrap items-baseline gap-x-4 gap-y-1 font-terminal text-[0.8rem] text-muted">
        <span>cost reduction, kernel density per method</span>
        <span className="ml-auto tabular-nums text-foreground">{TOTAL.toLocaleString()} runs</span>
      </figcaption>
    </figure>
  );
}
