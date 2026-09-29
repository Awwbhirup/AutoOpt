/**
 * The preview card a pasted share link unfurls into: what was optimized, by
 * how much, and whether it verified; for a suite, a bar per method. Drawn from
 * the same data as the page. A revoked or unknown link gets a plain card that
 * says nothing about what it used to share.
 */

import { ImageResponse } from "next/og";

import { methodLabel } from "@/lib/methods";
import { rampAt } from "@/lib/ramp";
import { loadSharedView } from "@/lib/shared-view";
import { percentReduction } from "@/lib/trace";

export const alt = "An AutoOpt result";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export const dynamic = "force-dynamic";

const BG = "#07080b";
const INK = "#eef1f5";
const MUTED = "#7d8694";
const KEPT = "#3ef2a0";
const REFUSED = "#ff6584";

function Frame({ kicker, title, children }: { kicker: string; title: string; children?: React.ReactNode }) {
  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        background: BG,
        backgroundImage:
          "linear-gradient(rgba(125,134,148,0.08) 1px, transparent 1px), linear-gradient(90deg, rgba(125,134,148,0.08) 1px, transparent 1px)",
        backgroundSize: "48px 48px",
        color: INK,
        padding: "64px 72px",
        fontFamily: "sans-serif",
      }}
    >
      <div style={{ display: "flex", height: 6, width: 240, borderRadius: 3, backgroundImage: `linear-gradient(90deg, ${rampAt(0)}, ${rampAt(0.5)}, ${rampAt(1)})` }} />
      <div style={{ display: "flex", marginTop: 36, fontSize: 26, color: MUTED, letterSpacing: 4, textTransform: "uppercase" }}>
        {kicker}
      </div>
      <div style={{ display: "flex", marginTop: 14, fontSize: 68, fontWeight: 700, lineHeight: 1.05, maxWidth: 1000 }}>
        {title}
      </div>
      <div style={{ display: "flex", flex: 1, marginTop: 40 }}>{children}</div>
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 24, color: MUTED }}>
        <span>AutoOpt</span>
        <span>every rewrite verified before it is kept</span>
      </div>
    </div>
  );
}

function Figure({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", marginRight: 72 }}>
      <span style={{ fontSize: 24, color: MUTED, textTransform: "uppercase", letterSpacing: 3 }}>{label}</span>
      <span style={{ fontSize: 64, fontWeight: 700, color: color ?? INK, marginTop: 6 }}>{value}</span>
    </div>
  );
}

export default async function Image({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const view = await loadSharedView(token);

  if (view === null || view.kind === "gone") {
    return new ImageResponse(<Frame kicker="shared link" title="This link is not available" />, size);
  }

  if (view.kind === "run") {
    const { run } = view;
    const reduction =
      run.costBefore === null || run.costAfter === null ? null : percentReduction(run.costBefore, run.costAfter);
    return new ImageResponse(
      <Frame kicker={`optimized with ${methodLabel(run.method)}`} title={run.program.name}>
        <div style={{ display: "flex", alignItems: "flex-end" }}>
          <Figure
            label="cost reduction"
            value={reduction === null ? "n/a" : `${reduction.toFixed(1)}%`}
            color={reduction !== null && reduction > 0 ? KEPT : undefined}
          />
          <Figure
            label="output"
            value={run.outputMatch === null ? "unchecked" : run.outputMatch ? "PASS" : "FAIL"}
            color={run.outputMatch === null ? MUTED : run.outputMatch ? KEPT : REFUSED}
          />
          <Figure label="status" value={run.status.toLowerCase()} />
        </div>
      </Frame>,
      size,
    );
  }

  const { results, suiteRun } = view;
  const ranked = results.methods.filter((method) => method.spread.mean !== null);
  const top = Math.max(1, ...ranked.map((method) => method.spread.mean ?? 0));
  return new ImageResponse(
    <Frame kicker="benchmark suite results" title={suiteRun.suite.name}>
      <div style={{ display: "flex", flexDirection: "column", width: "100%" }}>
        {[...ranked].reverse().slice(0, 5).map((method, index, list) => (
          <div key={method.method} style={{ display: "flex", alignItems: "center", marginBottom: 14 }}>
            <span style={{ display: "flex", flexDirection: "column", width: 330, fontSize: 28 }}>
              {method.label}
              {method.baseline ? <span style={{ color: MUTED, fontSize: 20 }}>control</span> : null}
            </span>
            <div
              style={{
                display: "flex",
                height: 22,
                borderRadius: 6,
                width: `${Math.max(((method.spread.mean ?? 0) / top) * 560, 4)}px`,
                background: rampAt(list.length <= 1 ? 1 : 1 - index / (list.length - 1)),
              }}
            />
            <span style={{ display: "flex", fontSize: 28, marginLeft: 18 }}>{(method.spread.mean ?? 0).toFixed(1)}%</span>
          </div>
        ))}
      </div>
    </Frame>,
    size,
  );
}
