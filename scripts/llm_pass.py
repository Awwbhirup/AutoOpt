"""Keeps the LLM pass going without being asked to.

The free tier allows 200,000 tokens a day, which covers roughly a fifth of the
corpus, so the pass is a multi-day job made of short bursts. Left to a person it
is a multi-day job made of short bursts that someone has to remember to start.

This waits for a network, runs the batch until the daily allowance is gone, then
sleeps and tries again. It stops on its own once the corpus is complete, and it
is safe to kill at any point: the batch writes each row as it finishes and
resumes from the file, so nothing is lost and nothing is repeated.

One worker by default. Put more API keys in engine/groq.keys, one per line,
and the corpus is split between them: each takes every Nth program, writes its
own file, and the files are folded back into llm.csv as they fill. Using keys
from separate accounts to get past a per-account limit is against Groq's
acceptable use policy, which says so by name.

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


def batch_log(shard: int, shards: int) -> Path:
    """Each worker writes its own.

    Handing one file handle to several processes lets their writes land at
    the same offset, so lines interleave halfway through and the log becomes
    unreadable exactly when something has gone wrong and it is needed.
    """
    if shards <= 1:
        return BATCH_LOG
    return BATCH_LOG.with_name(f"{BATCH_LOG.stem}_shard{shard}{BATCH_LOG.suffix}")


LOCK = ROOT / "data" / "runs" / "llm_pass.lock"
#: Written when the job has stopped making progress. Its presence is what
#: --status reports, so a silent stall has somewhere visible to show up.
STUCK = ROOT / "data" / "runs" / "llm_pass.stuck"
#: One API key per line. Each gets its own slice of the corpus and its own
#: output file. Absent or holding one key, the pass runs as a single worker.
KEYS_FILE = ROOT / "engine" / "groq.keys"

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

#: Windows gives a console to every process started from a windowless parent,
#: so the batch and the process checks each flash one up. There is nothing to
#: watch in them: the batch writes to its log and the checks are instant.
NO_WINDOW = getattr(subprocess, "CREATE_NO_WINDOW", 0) if os.name == "nt" else 0

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


def api_keys() -> list[str]:
    """The keys to spread the work across, in file order.

    Order matters: a key's position decides which slice of the corpus it takes,
    so the same file gives the same split every time and a restart resumes each
    worker where it was.
    """
    if not KEYS_FILE.exists():
        return []
    lines = KEYS_FILE.read_text(encoding="utf-8").splitlines()
    return [line.strip() for line in lines if line.strip() and not line.startswith("#")]


def shard_output(index: int) -> Path:
    """Each worker writes its own file.

    Pointing several workers at one CSV is what produced a duplicate row: they
    interleave, and the lock that would stop them can only refuse the second
    rather than coordinate. Separate files, merged afterwards, has no such race.
    """
    return OUT.with_name(f"{OUT.stem}_shard{index}{OUT.suffix}")


def _programs_in(path: Path) -> set[str]:
    if not path.exists():
        return set()
    with path.open(encoding="utf-8", newline="") as handle:
        return {
            row["program_id"] for row in csv.DictReader(handle) if row.get("program_id")
        }


def rows_done() -> int:
    """Distinct programs finished, across the main file and every shard.

    Counted through the CSV reader rather than by lines, because a decision log
    embedded in a field can contain newlines and counting those would report
    progress that does not exist. Counted as a set because a program answered by
    one worker must not be counted again when the files are merged.
    """
    finished = _programs_in(OUT)
    for index in range(len(api_keys())):
        finished |= _programs_in(shard_output(index))
    return len(finished)


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
            creationflags=NO_WINDOW,
        )
        return str(pid) in result.stdout
    try:
        os.kill(pid, 0)
    except OSError:
        return False
    return True


def orphaned_batches() -> list[int]:
    """Batch processes left behind by a supervisor that is gone.

    Windows kills a process without touching its children, so stopping the
    supervisor strands whatever batch it had running. A stranded batch still
    holds the output file and still spends quota, and two of them writing the
    same CSV is how a duplicate row got in.
    """
    if os.name != "nt":
        return []
    query = (
        "Get-CimInstance Win32_Process -Filter \"Name='python.exe'\" | "
        "Where-Object { $_.CommandLine -like '*autoopt.cli experiment*' } | "
        'ForEach-Object { "$($_.ProcessId) $($_.ParentProcessId)" }'
    )
    try:
        result = subprocess.run(
            ["powershell", "-NoProfile", "-NonInteractive", "-Command", query],
            capture_output=True,
            text=True,
            check=False,
            timeout=30,
            creationflags=NO_WINDOW,
        )
    except (OSError, subprocess.TimeoutExpired):
        return []

    mine = os.getpid()
    orphans = []
    for line in result.stdout.splitlines():
        parts = line.split()
        if len(parts) != 2:
            continue
        try:
            pid, parent = int(parts[0]), int(parts[1])
        except ValueError:
            continue
        # Anything whose parent is not this supervisor and not alive is loose.
        if parent != mine and not pid_alive(parent):
            orphans.append(pid)
    return orphans


def reap_orphans() -> None:
    for pid in orphaned_batches():
        subprocess.run(
            ["taskkill", "/PID", str(pid), "/T", "/F"],
            capture_output=True,
            check=False,
            creationflags=NO_WINDOW,
        )
        log(f"stopped an orphaned batch, pid {pid}")


def batch_command(output: Path, shard: int, shards: int) -> list[str]:
    command = [
        str(PYTHON),
        "-m",
        "autoopt.cli",
        "experiment",
        "--out",
        str(output),
        "--methods",
        "llm",
        "--no-fallback",
    ]
    if shards > 1:
        command += ["--shards", str(shards), "--shard", str(shard)]
    return command


def start_worker(
    shard: int, shards: int, key: str, sink: object
) -> subprocess.Popen[bytes]:
    """One worker, pinned to one key and one slice of the corpus.

    The key is passed through the environment rather than the command line,
    where it would be visible to anything that can list processes.
    """
    environment = dict(os.environ)
    if key:
        environment["GROQ_API_KEY"] = key
        # Only this provider. A worker that quietly fell through to another
        # would put a different model's answers in the same column.
        environment["AUTOOPT_LLM_PROVIDER"] = "groq"
        environment["AUTOOPT_LLM_FALLBACK"] = "0"
    return subprocess.Popen(
        batch_command(shard_output(shard) if shards > 1 else OUT, shard, shards),
        cwd=ENGINE,
        env=environment,
        stdout=sink,
        stderr=sink,
        creationflags=NO_WINDOW,
    )


def run_batch() -> int:
    """One burst across every configured key. Returns the worst exit code.

    Workers run together and are waited on together. The result reported is the
    least good of them, so a run where one key still has allowance and another
    does not is treated as the partial success it is rather than as finished.
    """
    keys = api_keys()
    shards = max(1, len(keys))
    BATCH_LOG.parent.mkdir(parents=True, exist_ok=True)
    seed_shards()
    stamp = f"{datetime.now().astimezone():%Y-%m-%d %H:%M:%S %z}"

    sinks = []
    workers = []
    try:
        for index in range(shards):
            sink = batch_log(index, shards).open(
                "a", encoding="utf-8", errors="replace"
            )
            sink.write(f"\n--- worker {index} of {shards} started {stamp} ---\n")
            sink.flush()
            sinks.append(sink)
            workers.append(
                start_worker(index, shards, keys[index] if keys else "", sink)
            )

        deadline = time.monotonic() + BATCH_TIMEOUT.total_seconds()
        codes = []
        for index, worker in enumerate(workers):
            remaining = max(1.0, deadline - time.monotonic())
            try:
                codes.append(worker.wait(timeout=remaining))
            except subprocess.TimeoutExpired:
                sinks[index].write("\n--- killed: over its time limit ---\n")
                worker.kill()
                worker.wait()
                codes.append(EXIT_TIMEOUT)
    finally:
        for sink in sinks:
            sink.close()

    if not codes:
        return 1
    if all(code == EXIT_QUOTA for code in codes):
        return EXIT_QUOTA
    # Any worker that failed for a reason other than quota is the news here.
    for code in codes:
        if code not in (0, EXIT_QUOTA):
            return code
    return 0


def last_batch_error() -> str:
    """The most useful line from the last batch, for the status summary.

    A stuck supervisor is only actionable if the reason is to hand, and the
    reason is buried in a traceback several hundred lines into a log nobody is
    watching.
    """
    logs = [BATCH_LOG, *(batch_log(i, 2) for i in range(len(api_keys())))]
    present = [path for path in logs if path.exists()]
    if not present:
        return ""
    newest = max(present, key=lambda path: path.stat().st_mtime)
    tail = newest.read_text(encoding="utf-8", errors="replace").splitlines()[-80:]
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
    # Before taking the output for ourselves, clear anything still holding
    # it from a supervisor that was killed rather than asked to stop.
    reap_orphans()
    barren = 0
    log(f"supervisor started, {rows_done()} of {TARGET_ROWS} programs done")

    try:
        while True:
            done = rows_done()
            if done >= TARGET_ROWS:
                combine_shards()
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

            if gained > 0:
                combine_shards()

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


def seed_shards() -> None:
    """Tell each worker what has already been answered.

    A worker resumes from its own output file and nothing else, so a fresh
    shard file means a fresh start: the first parallel run redid all 129
    programs the single-key pass had already finished, because none of the six
    had any way to know about them.

    Giving every shard a copy of what is already done costs some duplicated
    rows on disk and saves re-answering them. Extra rows are harmless, since a
    worker only ever works on its own slice and the merge keys on program id.
    """
    keys = api_keys()
    if len(keys) < 2 or not OUT.exists():
        return

    with OUT.open(encoding="utf-8", newline="") as handle:
        reader = csv.DictReader(handle)
        done_rows = list(reader)
        fields = reader.fieldnames or []
    if not done_rows:
        return

    for index in range(len(keys)):
        path = shard_output(index)
        present = _programs_in(path)
        missing = [row for row in done_rows if row["program_id"] not in present]
        if not missing:
            continue
        exists = path.exists()
        with path.open("a" if exists else "w", encoding="utf-8", newline="") as handle:
            writer = csv.DictWriter(handle, fieldnames=fields)
            if not exists:
                writer.writeheader()
            writer.writerows(missing)
        log(f"told worker {index} about {len(missing)} programs already done")


def combine_shards() -> int:
    """Fold every worker's file back into the main one.

    Done here rather than left for later because a pass that finished in six
    pieces is not finished from anywhere else's point of view, and the pieces
    are easy to forget. A program already in the main file wins, so re-running
    this is harmless.
    """
    keys = api_keys()
    if len(keys) < 2:
        return 0

    with OUT.open(encoding="utf-8", newline="") as handle:
        reader = csv.DictReader(handle)
        rows = list(reader)
        fields = reader.fieldnames or []
    seen = {row["program_id"] for row in rows}

    added = 0
    for index in range(len(keys)):
        path = shard_output(index)
        if not path.exists():
            continue
        with path.open(encoding="utf-8", newline="") as handle:
            for row in csv.DictReader(handle):
                if row["program_id"] in seen:
                    continue
                seen.add(row["program_id"])
                rows.append(row)
                added += 1

    if added:
        rows.sort(key=lambda row: row["program_id"])
        with OUT.open("w", encoding="utf-8", newline="") as handle:
            writer = csv.DictWriter(handle, fieldnames=fields)
            writer.writeheader()
            writer.writerows(rows)
        log(f"folded {added} rows from the workers into {OUT.name}")
    return added


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


def desktop_shortcut() -> int:
    """Put the live view one click away on the desktop.

    Written through the shell's own shortcut object rather than by hand,
    because a .lnk is a binary format and a hand-built one tends to work until
    something about the path changes.
    """
    if os.name != "nt":
        log("--shortcut only knows how to do this on Windows")
        return 1

    launcher = Path(__file__).resolve().with_name("watch-llm-pass.cmd")
    if not launcher.exists():
        log(f"no launcher at {launcher}")
        return 1

    lines = [
        'Set sh = CreateObject("WScript.Shell")',
        'desktop = sh.SpecialFolders("Desktop")',
        'Set link = sh.CreateShortcut(desktop & "\\AutoOpt progress.lnk")',
        f'link.TargetPath = "{launcher}"',
        f'link.WorkingDirectory = "{ROOT}"',
        'link.Description = "Live view of the AutoOpt optimization pass"',
        # The console icon, so it looks like the thing it opens.
        'link.IconLocation = "%SystemRoot%\\System32\\cmd.exe,0"',
        "link.Save",
    ]
    script = "\n".join(lines) + "\n"
    helper = ROOT / "data" / "runs" / "_shortcut.vbs"
    helper.parent.mkdir(parents=True, exist_ok=True)
    helper.write_text(script, encoding="utf-8")
    try:
        result = subprocess.run(
            ["cscript", "//nologo", str(helper)],
            capture_output=True,
            text=True,
            check=False,
            creationflags=NO_WINDOW,
        )
    finally:
        helper.unlink(missing_ok=True)

    if result.returncode != 0:
        log(f"could not create the shortcut: {result.stderr.strip()}")
        return result.returncode
    log("put 'AutoOpt progress' on the desktop")
    return 0


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
    parser.add_argument(
        "--shortcut", action="store_true", help="put the live view on the desktop"
    )
    args = parser.parse_args()

    if args.install:
        return install()
    if args.uninstall:
        return uninstall()
    if args.shortcut:
        return desktop_shortcut()
    if args.status:
        return status()
    return supervise()


if __name__ == "__main__":
    raise SystemExit(main())
