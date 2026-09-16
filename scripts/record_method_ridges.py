"""Write the landing page's ridgeline data from the finished grid.

One ridge per method: the distribution of cost reduction over every program it
was run on. This is the project's headline result rather than an illustration
of one, which is the only reason a landing page is allowed a chart this large.

    python scripts/record_method_ridges.py
"""

from __future__ import annotations

import json
import subprocess
import sys
from datetime import date
from pathlib import Path

import numpy as np
import pandas as pd
from scipy.stats import gaussian_kde

ROOT = Path(__file__).resolve().parent.parent
DATA = ROOT / "data" / "runs" / "complete.csv"
OUT = ROOT / "web" / "lib" / "method-ridges.ts"

#: Points along the shared axis. Enough for a smooth curve, few enough that the
#: whole file stays small and the browser redraws it sixty times a second.
RESOLUTION = 72


def main() -> int:
    frame = pd.read_csv(DATA)
    frame = frame[frame["error"].isna() | (frame["error"] == "")]
    frame["cost_reduction"] = pd.to_numeric(frame["cost_reduction"], errors="coerce")
    frame = frame.dropna(subset=["cost_reduction"])

    # A shared axis, so the ridges are comparable by eye. Clipped at the 99.5th
    # percentile: a couple of programs reduce by far more than the rest and
    # would otherwise flatten every distribution into the left margin.
    high = float(frame["cost_reduction"].quantile(0.995))
    grid = np.linspace(0.0, high, RESOLUTION)

    ridges = []
    for method, rows in frame.groupby("method"):
        values = rows["cost_reduction"].to_numpy()
        if values.std() < 1e-9:
            # A method that returns the same number every time has no density to
            # estimate. Draw it as the spike it is rather than crashing the KDE.
            density = np.zeros(RESOLUTION)
            density[int(np.clip(values[0] / high, 0, 1) * (RESOLUTION - 1))] = 1.0
        else:
            density = gaussian_kde(values, bw_method=0.35)(grid)
        ridges.append(
            {
                "method": str(method),
                "mean": round(float(values.mean()), 4),
                "median": round(float(np.median(values)), 4),
                "n": int(len(values)),
                # Normalised per ridge: the shape of each distribution is the
                # subject, and the tall narrow ones would otherwise bury the
                # rest. The mean carries the level, and it is printed.
                "density": [round(float(v), 5) for v in density / density.max()],
            }
        )

    # Weakest first, so the ridgeline reads front to back as the methods
    # improving and the LLM arms sit at the near edge where they are legible.
    ridges.sort(key=lambda ridge: ridge["mean"])

    revision = subprocess.run(
        ["git", "rev-parse", "--short", "HEAD"],
        cwd=ROOT,
        capture_output=True,
        text=True,
        check=False,
    ).stdout.strip()

    body = f'''/**
 * How much each method actually takes off, across the whole grid.
 *
 * One ridge per method: a kernel density estimate of cost reduction over every
 * program that method was run on, {len(frame):,} runs in total. Not an
 * illustration of a result, the result: the three search methods that can cross
 * a cost-neutral state sit together at the back, the three that cannot sit
 * together in the middle, and the LLM arms sit at the front. A Tukey HSD on the
 * same data separates exactly those three groups.
 *
 * Each ridge is normalised to its own peak, because the shape of a distribution
 * is what a ridgeline is for and the tall narrow ones would otherwise bury the
 * rest. The level is carried by the mean, which is printed.
 *
 * Regenerate:  python scripts/record_method_ridges.py
 *
 * Built {date.today().isoformat()} from {revision or "an untracked tree"}, off
 * data/runs/complete.csv.
 */

export interface MethodRidge {{
  method: string;
  mean: number;
  median: number;
  n: number;
  /** Density along AXIS, normalised so each ridge peaks at 1. */
  density: number[];
}}

/** Cost reduction each density sample sits at, shared by every ridge. */
export const AXIS: number[] = {json.dumps([round(float(v), 5) for v in grid])};

export const RIDGES: MethodRidge[] = {json.dumps(ridges, indent=1)};
'''

    OUT.write_text(body, encoding="utf-8", newline="\n")
    print(f"wrote {OUT.relative_to(ROOT)}  {OUT.stat().st_size / 1024:.1f} KB")
    for ridge in ridges:
        print(f"  {ridge['method']:<22} mean {ridge['mean']:.3f}  n={ridge['n']}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
