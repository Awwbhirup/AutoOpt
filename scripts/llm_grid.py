"""Fills the LLM arm's missing cells in the method-by-budget grid.

The rule-based methods were measured at node budgets 6, 10 and 16 as well as
unconstrained, which is what budgeted.csv holds: six methods, three budgets,
five hundred programs. The LLM arm was only ever run unconstrained, so the one
method the project is actually about is absent from every budget comparison,
and M6 reads as a comparison of the methods that happen to be cheap.

This runs the missing cells. One at a time, because every cell uses the same
nine keys and the engine paces itself against a per-minute token bucket it
assumes it has to itself; two runs sharing a key each think they have the whole
bucket and spend the difference on refused requests.

    python scripts/llm_grid.py            # run the missing cells
    python scripts/llm_grid.py --status   # what is done and what is left

It waits for any other pass to finish before starting, so it can be launched
while one is still going. Each cell is an ordinary llm_pass run with its own
file, lock and log, so a cell can be watched, killed or resumed on its own.
"""

from __future__ import annotations

import argparse
import os
import subprocess
import sys
import time
from datetime import datetime, timedelta
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(Path(__file__).resolve().parent))

import llm_pass

#: The budgets the rule-based methods were measured at. Matching them exactly is
#: the point: a budget only this arm was run at would not be comparable to
#: anything.
BUDGETS = (6, 10, 16)
METHOD = os.environ.get("AUTOOPT_GRID_METHOD", "llm")

LOG = ROOT / "data" / "runs" / f"{METHOD}_grid.log"
#: Anything a supervisor printed rather than logged, kept apart from the
#: decisions so the decision log stays readable.
CONSOLE = ROOT / "data" / "runs" / f"{METHOD}_grid_console.log"
#: The interpreter with the engine installed, not whichever one started this.
#: Launched at logon this is pythonw, which cannot import autoopt.
PYTHON = llm_pass.PYTHON
#: How often to look again while another pass has the keys.
WAIT_FOR_KEYS = timedelta(minutes=2)


def log(message: str) -> None:
    stamp = f"{datetime.now().astimezone():%Y-%m-%d %H:%M:%S %z}"
    LOG.parent.mkdir(parents=True, exist_ok=True)
    with LOG.open("a", encoding="utf-8") as handle:
        handle.write(f"{stamp}  {message}\n")


def tag(budget: int) -> str:
    return f"{METHOD}_b{budget}"


def cell_output(budget: int) -> Path:
    return ROOT / "data" / "runs" / f"{tag(budget)}.csv"


def rows_in(path: Path) -> int:
    """Programs answered in a cell, across its file and its workers' files.

    llm_pass.rows_done would be the obvious thing to call, but its paths were
    fixed when it was imported here, so it would count the unconstrained arm's
    files no matter which cell was asked about. The shard files matter: a worker
    writes its own until the supervisor folds them in, so counting only the
    combined file reports a cell as unfinished through most of its last batch.
    """
    answered = llm_pass._programs_in(path)
    for shard in path.parent.glob(f"{path.stem}_shard*.csv"):
        answered |= llm_pass._programs_in(shard)
    return len(answered)


def cell_done(budget: int) -> bool:
    return rows_in(cell_output(budget)) >= llm_pass.TARGET_ROWS


def run_cell(budget: int) -> int:
    """One budget, start to finish. Returns the supervisor's exit code."""
    environment = dict(os.environ)
    environment["AUTOOPT_PASS_METHOD"] = METHOD
    environment["AUTOOPT_PASS_BUDGET"] = str(budget)
    environment.pop("AUTOOPT_PASS_TAG", None)
    environment.pop("AUTOOPT_PASS_LIMIT", None)

    log(f"budget {budget}: starting at {rows_in(cell_output(budget))} programs")
    # Somewhere to put whatever the supervisor says on its way out. Launched
    # from a windowless process it has no console to write to, so a traceback
    # would otherwise be lost and the cell would just stop.
    with CONSOLE.open("ab") as sink:
        result = subprocess.run(
            [str(PYTHON), str(Path(__file__).with_name("llm_pass.py"))],
            env=environment,
            creationflags=llm_pass.NO_WINDOW,
            stdout=sink,
            stderr=sink,
            check=False,
        )
    log(
        f"budget {budget}: supervisor exited {result.returncode}, "
        f"{rows_in(cell_output(budget))} programs answered"
    )
    return result.returncode


def wait_for_keys() -> None:
    """Hold off while another pass is using them.

    Named rather than inlined because the reason is not obvious: the wait is not
    about the output file, which is this run's alone, but about the nine keys
    every run shares.
    """
    waited = False
    while True:
        busy = llm_pass.running_arm()
        if busy is None:
            if waited:
                log("keys are free")
            return
        if not waited:
            log(f"{busy} has the keys; waiting for it to finish")
            waited = True
        time.sleep(WAIT_FOR_KEYS.total_seconds())


def status() -> int:
    for budget in BUDGETS:
        done = rows_in(cell_output(budget))
        mark = "complete" if done >= llm_pass.TARGET_ROWS else "in progress"
        print(f"budget {budget:>3}: {done:>3} of {llm_pass.TARGET_ROWS}  {mark}")
    busy = llm_pass.running_arm()
    print(f"\nkeys: {'held by ' + busy if busy else 'free'}")
    if LOG.exists():
        print("\nlast few decisions:")
        for line in LOG.read_text(encoding="utf-8").splitlines()[-6:]:
            print(f"  {line}")
    return 0


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--status", action="store_true", help="what is done and what is left"
    )
    args = parser.parse_args()
    if args.status:
        return status()

    log(f"grid run for {METHOD} at budgets {', '.join(str(b) for b in BUDGETS)}")
    for budget in BUDGETS:
        if cell_done(budget):
            log(f"budget {budget}: already complete, skipping")
            continue
        wait_for_keys()
        run_cell(budget)
        if not cell_done(budget):
            # Out of allowance rather than out of work. Stopping here leaves the
            # later budgets untouched instead of starting each of them at zero
            # and leaving three half-filled cells nothing can be said about.
            log(f"budget {budget}: not complete; stopping so it is finished first")
            return 1
    log("every budget complete")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
