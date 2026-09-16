"""Record one real run and write it out as the landing page's data file.

Regenerating it is the whole point: if the engine's behaviour on this program
changes, rerunning this script changes the page, and nothing on the page is a
number somebody typed in by hand.
"""

from __future__ import annotations

import json
import subprocess
import sys
from datetime import date
from pathlib import Path

ROOT = Path(r"C:\Users\Abhirup\Desktop\CD + PROB PROJECT")
sys.path.insert(0, str(ROOT / "engine"))

PROGRAM_ID = "conditional_001"
METHOD = "greedy"
OUT = ROOT / "web" / "lib" / "recorded-run.ts"


def main() -> int:
    from autoopt.datagen import generate
    from autoopt.ir import source_to_tac
    from autoopt.orchestrator.agent import RunConfig, optimize

    program = next(p for p in generate() if p.program_id == PROGRAM_ID)
    log: list[object] = []
    result = optimize(
        source_to_tac(program.source),
        config=RunConfig(method=METHOD, use_smt=False, prove_final=True),
        sink=log.append,
        program_id=PROGRAM_ID,
    )
    events = [json.loads(event.model_dump_json()) for event in log]

    revision = subprocess.run(
        ["git", "rev-parse", "--short", "HEAD"],
        cwd=ROOT,
        capture_output=True,
        text=True,
        check=False,
    ).stdout.strip()

    body = f'''/**
 * One real run of the engine, recorded, for the landing page to replay.
 *
 * Not a mock and not an illustration. These are the events the engine emitted
 * optimizing {PROGRAM_ID} with the {METHOD} strategy, in the order it emitted
 * them, and the page folds them with the same foldTrace the run pages use. If
 * the engine's behaviour changes, this file is regenerated and the page changes
 * with it; nothing here is a figure anyone typed in.
 *
 * Regenerate:  python scripts/record_landing_run.py
 *
 * Recorded {date.today().isoformat()} from {revision or "an untracked tree"}.
 * Program {PROGRAM_ID} ({program.category.value}), {METHOD}, per-step
 * verification by differential testing, Z3 proof on the final program.
 */

import type {{ StreamedEvent }} from "./events";

/** The source the run started from, as the generator wrote it. */
export const RECORDED_SOURCE = {json.dumps(program.source)};

export const RECORDED_PROGRAM_ID = {json.dumps(PROGRAM_ID)};
export const RECORDED_METHOD = {json.dumps(METHOD)};

/** Measured, not asserted: {result.cost_reduction:.1%} off the weighted cost model. */
export const RECORDED_REDUCTION = {round(result.cost_reduction, 4)};

export const RECORDED_EVENTS: StreamedEvent[] = {json.dumps(events, indent=1)} as StreamedEvent[];
'''

    OUT.write_text(body, encoding="utf-8", newline="\n")
    decisions = [e for e in events if e["kind"] == "decision"]
    kept = sum(1 for d in decisions if d["accepted"])
    print(f"wrote {OUT.relative_to(ROOT)}  {OUT.stat().st_size / 1024:.1f} KB")
    print(f"{len(events)} events, {len(decisions)} decided: {kept} kept, {len(decisions) - kept} refused")
    print(f"reduction {result.cost_reduction:.1%}  output match {result.output_match}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
