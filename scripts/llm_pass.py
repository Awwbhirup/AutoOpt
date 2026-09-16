"""Keeps the LLM pass going without being asked to.

The free tier allows 200,000 tokens a day, which covers roughly a fifth of the
corpus, so the pass is a multi-day job made of short bursts. Left to a person it
is a multi-day job made of short bursts that someone has to remember to start.

This waits for a network, runs the batch until the daily allowance is gone, then
sleeps and tries again. It stops on its own once the corpus is complete, and it
is safe to kill at any point: the batch writes each row as it finishes and
resumes from the file, so nothing is lost and nothing is repeated.

Run it directly, or have it start at every logon with:

    python scripts/llm_pass.py --install     # adds a Startup folder entry
    python scripts/llm_pass.py --status      # progress and recent decisions
    python scripts/llm_pass.py --uninstall   # removes it

Every decision it makes goes to data/runs/llm_pass.log with a timestamp, and
the batch's own output to llm_pass_batches.log, so a week of unattended running
can be read back afterwards.
"""

from __future__ import annotations

import argparse
import csv
import os
import socket
import subprocess
import sys
import time
from datetime import datetime, timedelta
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
ENGINE = ROOT / "engine"
PYTHON = ROOT / ".venv" / "Scripts" / "python.exe"
if not PYTHON.exists():  # not Windows
    PYTHON = ROOT / ".venv" / "bin" / "python"

OUT = ROOT / "data" / "runs" / "llm.csv"
LOG = ROOT / "data" / "runs" / "llm_pass.log"
#: The batch's own console output, kept apart from the supervisor's decisions
#: so the decision log stays readable.
BATCH_LOG = ROOT / "data" / "runs" / "llm_pass_batches.log"
LOCK = ROOT / "data" / "runs" / "llm_pass.lock"
#: Written when the job has stopped making progress. Its presence is what
#: --status reports, so a silent stall has somewhere visible to show up.
STUCK = ROOT / "data" / "runs" / "llm_pass.stuck"

TARGET_ROWS = 500
TASK_NAME = "AutoOptLlmPass"

#: Quota is a rolling window rather than a clock reset, so rather than working
#: out when it lifts, ask again periodically. A refused request is cheap.
RETRY_AFTER_QUOTA = timedelta(minutes=45)
#: Something other than quota went wrong. Longer, because retrying a real fault
#: quickly just fills the log.
RETRY_AFTER_ERROR = timedelta(minutes=90)
#: No network. Short, because this is the case that resolves on its own.
RETRY_AFTER_OFFLINE = timedelta(minutes=5)

EXIT_QUOTA = 2
#: Not a code the batch can return. Used to record that it was killed.
EXIT_TIMEOUT = 124

#: Longer than a full day's allowance takes to spend, so it only fires on
#: something genuinely wedged rather than on a slow day.
BATCH_TIMEOUT = timedelta(hours=8)

#: Consecutive batches that added no rows before the job is called stuck.
#: Two is a bad afternoon. Three is something that needs looking at, and
#: waiting longer to say so only wastes more days.
BARREN_LIMIT = 3


def log(message: str) -> None:
    # Local time, and aware rather than naive, so a log read back weeks later
    # still says which hour it meant.
    stamp = datetime.now().astimezone().strftime("%Y-%m-%d %H:%M:%S %z")
    line = f"{stamp}  {message}"
    # Under pythonw there is no console and sys.stdout is None, so printing
    # would raise before anything reached the log. The file is the real record;
    # the console is a convenience for when it is run by hand.
    if sys.stdout is not None:
        print(line, flush=True)
    LOG.parent.mkdir(parents=True, exist_ok=True)
    with LOG.open("a", encoding="utf-8") as handle:
        handle.write(line + "\n")


def rows_done() -> int:
    """How many programs are already in the file.

    Counted through the CSV reader rather than by lines, because a decision log
    embedded in a field can contain newlines and counting those would report
    progress that does not exist.
    """
    if not OUT.exists():
        return 0
    with OUT.open(encoding="utf-8", newline="") as handle:
        return sum(1 for _ in csv.DictReader(handle))


def online(host: str = "api.groq.com", port: int = 443, timeout: float = 5.0) -> bool:
    """A real connection to the host that matters, not a ping to somewhere else.

    A laptop can be joined to a network that has no route out, and a captive
    portal will answer almost anything, so the only useful question is whether
    the provider itself is reachable.
    """
    try:
        with socket.create_connection((host, port), timeout=timeout):
            return True
    except OSError:
        return False


def already_running() -> bool:
    """Two copies would interleave writes into one CSV.

    The lock holds a process id so a stale file left by a hard shutdown does not
    block every future run, which is the usual way lock files become a problem
    of their own.
    """
    if not LOCK.exists():
        return False
    try:
        pid = int(LOCK.read_text(encoding="utf-8").strip())
    except (ValueError, OSError):
        return False
    if pid == os.getpid():
        return False
    return pid_alive(pid)


def pid_alive(pid: int) -> bool:
    if sys.platform == "win32":
        result = subprocess.run(
            ["tasklist", "/FI", f"PID eq {pid}", "/NH"],
            capture_output=True,
            text=True,
            check=False,
        )
        return str(pid) in result.stdout
    try:
        os.kill(pid, 0)
    except OSError:
        return False
    return True


def run_batch() -> int:
    """One burst. Returns the batch's exit code."""
    command = [
        str(PYTHON),
        "-m",
        "autoopt.cli",
        "experiment",
        "--out",
        str(OUT),
        "--methods",
        "llm",
        "--no-fallback",
    ]
    # The batch's own output goes to a file rather than being inherited. Run
    # under pythonw the inherited handles are not valid, and the progress lines
    # are worth keeping anyway for a job that runs unattended for days.
    BATCH_LOG.parent.mkdir(parents=True, exist_ok=True)
    with BATCH_LOG.open("a", encoding="utf-8", errors="replace") as sink:
        sink.write(
            f"\n--- batch started {datetime.now().astimezone():%Y-%m-%d %H:%M:%S %z} ---\n"
        )
        sink.flush()
        try:
            result = subprocess.run(
                command,
                cwd=ENGINE,
                check=False,
                stdout=sink,
                stderr=sink,
                # A socket that never answers would otherwise hold the
                # supervisor open forever, and a supervisor waiting on a dead
                # batch looks exactly like one doing its job.
                timeout=BATCH_TIMEOUT.total_seconds(),
            )
        except subprocess.TimeoutExpired:
            sink.write("\n--- batch killed: exceeded its time limit ---\n")
            return EXIT_TIMEOUT
    return result.returncode


def last_batch_error() -> str:
    """The most useful line from the last batch, for the status summary.

    A stuck supervisor is only actionable if the reason is to hand, and the
    reason is buried in a traceback several hundred lines into a log nobody is
    watching.
    """
    if not BATCH_LOG.exists():
        return ""
    tail = BATCH_LOG.read_text(encoding="utf-8", errors="replace").splitlines()[-80:]
    for line in reversed(tail):
        stripped = line.strip().strip("|").strip()
        if stripped.endswith("Error") or ": " in stripped and "Error" in stripped:
            return stripped[:200]
    return ""


def supervise() -> int:
    if already_running():
        log("another copy is already running; leaving it alone")
        return 0

    LOCK.parent.mkdir(parents=True, exist_ok=True)
    LOCK.write_text(str(os.getpid()), encoding="utf-8")
    STUCK.unlink(missing_ok=True)
    barren = 0
    log(f"supervisor started, {rows_done()} of {TARGET_ROWS} programs done")

    try:
        while True:
            done = rows_done()
            if done >= TARGET_ROWS:
                log(f"corpus complete at {done} programs; nothing left to do")
                return 0

            if not online():
                log(f"offline, waiting {RETRY_AFTER_OFFLINE}")
                time.sleep(RETRY_AFTER_OFFLINE.total_seconds())
                continue

            log(f"starting a batch from {done} of {TARGET_ROWS}")
            code = run_batch()
            gained = rows_done() - done

            # Progress, not exit code, is what says whether this is working.
            # Running out of allowance having done nothing is the same dead end
            # as crashing, and both looked healthy from the outside.
            if gained > 0:
                barren = 0
                STUCK.unlink(missing_ok=True)
            else:
                barren += 1

            if code == 0:
                log(f"batch finished cleanly, {gained} programs added")
                continue
            if code == EXIT_QUOTA:
                log(
                    f"daily allowance spent after {gained} programs; "
                    f"waiting {RETRY_AFTER_QUOTA}"
                )
                if barren >= BARREN_LIMIT:
                    mark_stuck(barren, code)
                time.sleep(RETRY_AFTER_QUOTA.total_seconds())
                continue

            log(
                f"batch exited {code} after {gained} programs; waiting {RETRY_AFTER_ERROR}"
            )
            if barren >= BARREN_LIMIT:
                mark_stuck(barren, code)
            time.sleep(RETRY_AFTER_ERROR.total_seconds())
    except KeyboardInterrupt:
        log("stopped by hand")
        return 130
    finally:
        LOCK.unlink(missing_ok=True)


def mark_stuck(barren: int, code: int) -> None:
    """Record that the job has stopped getting anywhere.

    It ran for a whole day adding nothing while reporting itself as running,
    because nothing distinguished "waiting for quota" from "failing every time".
    Progress is the only honest measure, so a run of empty batches is written
    somewhere --status will find it.
    """
    reason = last_batch_error() or f"batch exit code {code}"
    message = f"{barren} batches in a row added nothing. Last error: {reason}"
    STUCK.write_text(message, encoding="utf-8")
    log(f"STUCK: {message}")


def startup_entry() -> Path:
    """Where Windows looks for things to run when this user logs in.

    The Startup folder rather than Task Scheduler because registering a task
    needs elevation on this machine and this does not. It is also easier to see
    and to undo: one file, which the user can delete.
    """
    appdata = os.environ.get("APPDATA", "")
    return (
        Path(appdata)
        / "Microsoft"
        / "Windows"
        / "Start Menu"
        / "Programs"
        / "Startup"
        / f"{TASK_NAME}.vbs"
    )


def install() -> int:
    """Arrange to start at logon.

    At logon rather than at a fixed hour, because the machine is a laptop and is
    not reliably awake at any particular time. The supervisor handles being
    started with no network and with no allowance left, so starting it more
    often than necessary costs nothing.
    """
    if sys.platform != "win32":
        log("--install only knows how to do this on Windows")
        return 1

    # pythonw, so no console window appears for something that runs unattended
    # for days. Its progress is in the log and in --status.
    launcher = PYTHON.with_name("pythonw.exe")
    if not launcher.exists():
        launcher = PYTHON

    # A .vbs rather than a .cmd: a batch file flashes a console window at every
    # logon even when what it launches has none.
    script = (
        'Set sh = CreateObject("WScript.Shell")\n'
        f'sh.Run """{launcher}"" ""{Path(__file__).resolve()}""", 0, False\n'
    )
    entry = startup_entry()
    try:
        entry.parent.mkdir(parents=True, exist_ok=True)
        entry.write_text(script, encoding="utf-8")
    except OSError as error:
        log(f"could not write the startup entry: {error}")
        return 1

    log(f"installed: {entry}")
    log("it will start at every logon, and stop itself once the corpus is done")
    log(
        f"remove it by deleting that file, or with: python {Path(__file__).name} --uninstall"
    )
    return 0


def uninstall() -> int:
    entry = startup_entry()
    if not entry.exists():
        log("nothing installed")
        return 0
    try:
        entry.unlink()
    except OSError as error:
        log(f"could not remove it: {error}")
        return 1
    log(f"removed {entry}")
    return 0


def status() -> int:
    done = rows_done()
    print(f"{done} of {TARGET_ROWS} programs done ({done / TARGET_ROWS:.0%})")
    print(f"running: {'yes' if already_running() else 'no'}")
    # Said before anything else, because a supervisor that is running and a
    # supervisor that is working are not the same thing and the difference has
    # already cost a day.
    if STUCK.exists():
        print()
        print(f"NOT PROGRESSING: {STUCK.read_text(encoding='utf-8').strip()}")
    if LOG.exists():
        tail = LOG.read_text(encoding="utf-8").splitlines()[-5:]
        print("\nlast few decisions:")
        for line in tail:
            print(f"  {line}")
    return 0


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--install", action="store_true", help="register to run at logon"
    )
    parser.add_argument(
        "--uninstall", action="store_true", help="remove the scheduled task"
    )
    parser.add_argument(
        "--status", action="store_true", help="progress and recent decisions"
    )
    args = parser.parse_args()

    if args.install:
        return install()
    if args.uninstall:
        return uninstall()
    if args.status:
        return status()
    return supervise()


if __name__ == "__main__":
    raise SystemExit(main())
