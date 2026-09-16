"""A live view of the pass, for when you want to watch it.

Separate from the supervisor on purpose. The supervisor runs invisibly for days
and must not depend on anyone looking at it; this is a window you open when you
want to know how it is going, and closing it changes nothing.

    python scripts/llm_watch.py

Progress comes from the output files, which cost nothing to read. Remaining
allowance has to be asked for, so it is asked rarely: one tiny request per key
per minute, a few tokens each, against a daily budget of two hundred thousand.
"""

from __future__ import annotations

import os
import sys
import threading
import time
from collections import deque
from dataclasses import dataclass, field

import httpx
from rich.console import Console, Group
from rich.live import Live
from rich.panel import Panel
from rich.progress import BarColumn, Progress, TextColumn
from rich.table import Table
from rich.text import Text

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

# Which run to watch has to be settled before llm_pass is imported, since its
# paths are derived from it at import time. A run named on the command line
# wins; failing that, whichever run is currently going; failing that, the
# default. The view is opened from a desktop shortcut that cannot know which
# run is in flight, and showing a finished one while another works looks
# exactly like the thing being broken.
#
# The name is the tag, not the method: the LLM arm is measured at several node
# budgets, and those runs share a method and differ in everything else.
if len(sys.argv) > 1 and not sys.argv[1].startswith("-"):
    os.environ["AUTOOPT_PASS_TAG"] = sys.argv[1]
    if len(sys.argv) > 2 and sys.argv[2].isdigit():
        os.environ["AUTOOPT_PASS_LIMIT"] = sys.argv[2]
else:
    import llm_pass as _probe

    _live = _probe.running_arm()
    if _live:
        os.environ["AUTOOPT_PASS_TAG"] = _live
        # The target row count comes from the limit, and the limit is not
        # written down anywhere except the running supervisor's environment.
        # Infer it from what that run's workers were told.
        os.environ.setdefault("AUTOOPT_PASS_LIMIT", str(_probe.running_limit(_live)))
    del sys.modules["llm_pass"]

import llm_pass as pass_

REFRESH_SECONDS = 2.0
#: How often to ask a key what it has left. Rare, because asking costs a request
#: against the very budget being reported.
QUOTA_EVERY = 60.0
#: Rate is averaged over this much history rather than since the start, so a
#: worker running out of allowance shows up as a slowdown within a minute or two
#: instead of being hidden behind a good first hour.
RATE_WINDOW_SECONDS = 180.0
#: How much of a worker's log to read to find what it is on. Progress lines are
#: short and the one wanted is the last, so this only has to be generous enough
#: to clear a summary table or a traceback.
LOG_TAIL_BYTES = 4096

ENDPOINT = "https://api.groq.com/openai/v1/chat/completions"


@dataclass
class Quota:
    """What a key reported when last asked. Stale by design; the age is shown."""

    requests_left: int | None = None
    requests_limit: int | None = None
    checked_at: float = 0.0
    trouble: str = ""


@dataclass
class Watcher:
    keys: list[str] = field(default_factory=list)
    quotas: dict[int, Quota] = field(default_factory=dict)
    history: deque[tuple[float, int]] = field(default_factory=lambda: deque(maxlen=400))
    started_at: float = field(default_factory=time.monotonic)
    started_done: int = 0

    def __post_init__(self) -> None:
        self.keys = pass_.api_keys()
        self.started_done = pass_.rows_done()
        for index in range(max(1, len(self.keys))):
            self.quotas[index] = Quota()

    # --- what each worker was given ------------------------------------------

    def assigned(self, index: int) -> list[str]:
        """The programs this worker was handed when the batch started.

        Read from the file the supervisor wrote rather than worked out again
        here. The split is recomputed from what is still missing every batch, so
        a second implementation of it would be right only until a worker ran out
        of allowance, which is exactly when this is worth looking at.
        """
        try:
            return [
                line.strip()
                for line in pass_.worklist(index)
                .read_text(encoding="utf-8")
                .splitlines()
                if line.strip()
            ]
        except OSError:
            return []

    def answered_by(self, index: int) -> int:
        """How much of this worker's batch is finished."""
        shard_file = pass_.shard_output(index) if len(self.keys) > 1 else pass_.OUT
        done = pass_._programs_in(shard_file) | pass_._programs_in(pass_.OUT)
        return len(done & set(self.assigned(index)))

    def working_on(self, index: int) -> str:
        """The program this worker last reported starting, from its own log.

        The counts only move when a program finishes, so a worker three minutes
        into a large one looks exactly like a worker that has died. This is the
        difference between them, and it costs one tail read.
        """
        log = pass_.batch_log(index, max(1, len(self.keys)))
        try:
            with log.open("rb") as handle:
                handle.seek(0, os.SEEK_END)
                handle.seek(max(0, handle.tell() - LOG_TAIL_BYTES))
                tail = handle.read().decode("utf-8", "replace")
        except OSError:
            return ""

        # A progress line starts with a count and ends with the program and the
        # method. Everything else in the file is a summary table, a banner or a
        # traceback, and names neither.
        for line in reversed(tail.splitlines()):
            parts = line.split()
            if len(parts) >= 2 and parts[-1] == pass_.METHOD and "/" in parts[0]:
                return parts[-2]
        return ""

    # --- numbers -------------------------------------------------------------

    def rate_per_minute(self) -> float:
        """Programs a minute, over the recent window only."""
        if len(self.history) < 2:
            return 0.0
        now = self.history[-1][0]
        recent = [
            point for point in self.history if now - point[0] <= RATE_WINDOW_SECONDS
        ]
        if len(recent) < 2:
            recent = list(self.history)[-2:]
        elapsed = recent[-1][0] - recent[0][0]
        gained = recent[-1][1] - recent[0][1]
        return (gained / elapsed) * 60 if elapsed > 0 else 0.0

    def eta_text(self, remaining: int) -> str:
        rate = self.rate_per_minute()
        if remaining <= 0:
            return "done"
        if rate <= 0:
            # Not the same as stopped, and calling it stalled made it look that
            # way. The last programs of the corpus are its largest and take
            # minutes each, so an empty window is how a run normally ends.
            return f"nothing finished in {RATE_WINDOW_SECONDS / 60:.0f} min"
        minutes = remaining / rate
        if minutes < 90:
            return f"{minutes:.0f} min"
        return f"{minutes / 60:.1f} hours"

    # --- asking the provider -------------------------------------------------

    def refresh_quotas(self) -> None:
        """One thread, so a slow provider never freezes the display."""
        model = pass_.arm_model() or os.environ.get(
            "AUTOOPT_GROQ_MODEL", "qwen/qwen3.8-27b"
        )
        for index, key in enumerate(self.keys):
            quota = self.quotas[index]
            try:
                response = httpx.post(
                    ENDPOINT,
                    headers={"Authorization": f"Bearer {key}"},
                    json={
                        "model": model,
                        "messages": [{"role": "user", "content": "hi"}],
                        "max_tokens": 1,
                    },
                    timeout=20,
                )
                left = response.headers.get("x-ratelimit-remaining-requests")
                limit = response.headers.get("x-ratelimit-limit-requests")
                quota.requests_left = int(left) if left and left.isdigit() else None
                quota.requests_limit = int(limit) if limit and limit.isdigit() else None
                quota.trouble = (
                    "" if response.status_code == 200 else str(response.status_code)
                )
            except (httpx.HTTPError, ValueError) as error:
                quota.trouble = type(error).__name__
            quota.checked_at = time.monotonic()

    # --- rendering -----------------------------------------------------------

    def render(self) -> Group:
        done = pass_.rows_done()
        self.history.append((time.monotonic(), done))
        remaining = pass_.TARGET_ROWS - done
        shards = max(1, len(self.keys))

        bar = Progress(
            TextColumn("[bold]{task.description}"),
            BarColumn(bar_width=46),
            TextColumn("{task.completed} of {task.total}"),
            TextColumn("[dim]{task.percentage:>3.0f}%"),
            expand=False,
        )
        bar.add_task(pass_.TAG, total=pass_.TARGET_ROWS, completed=done)

        table = Table(box=None, pad_edge=False, header_style="dim")
        table.add_column("worker", justify="right")
        table.add_column("this batch", justify="right")
        table.add_column("requests left", justify="right")
        table.add_column("", justify="left")
        table.add_column("on", justify="left")

        idle = 0
        for index in range(shards):
            given = len(self.assigned(index))
            finished_here = self.answered_by(index)
            quota = self.quotas.get(index, Quota())

            if quota.trouble:
                left = Text(quota.trouble, style="red")
            elif quota.requests_left is None:
                left = Text("asking", style="dim")
            else:
                share = quota.requests_left / (quota.requests_limit or 1000)
                style = "green" if share > 0.35 else "yellow" if share > 0.1 else "red"
                left = Text(
                    f"{quota.requests_left} / {quota.requests_limit}", style=style
                )

            age = time.monotonic() - quota.checked_at if quota.checked_at else None
            age_text = Text(f"{age:.0f}s ago" if age else "", style="dim")

            if given == 0:
                idle += 1
                progress = Text("nothing to do", style="dim")
                here = ""
            else:
                complete = finished_here >= given
                if complete:
                    idle += 1
                progress = Text(
                    f"{finished_here} / {given}", style="green" if complete else "white"
                )
                here = "" if complete else self.working_on(index)

            table.add_row(
                str(index),
                progress,
                left,
                age_text,
                Text(here, style="cyan" if here else "dim"),
            )

        gained = done - self.started_done
        elapsed = (time.monotonic() - self.started_at) / 60
        summary = Text()
        summary.append(f"{self.rate_per_minute():.1f} programs/min", style="bold")
        summary.append("   remaining ", style="dim")
        summary.append(str(remaining))
        summary.append("   eta ", style="dim")
        summary.append(self.eta_text(remaining), style="bold cyan")
        summary.append(f"   (+{gained} in {elapsed:.0f} min watching)", style="dim")

        running = pass_.already_running()
        state = Text()
        state.append("supervisor ", style="dim")
        state.append(
            "running" if running else "NOT RUNNING", style="green" if running else "red"
        )
        if idle and remaining > 0:
            # Worth saying: the point of sharing out what is left is that this
            # should be zero until there is less work than there are workers.
            state.append(f"   {idle} of {shards} idle", style="dim")
        if pass_.STUCK.exists():
            state.append("   NOT PROGRESSING: ", style="bold red")
            state.append(
                pass_.STUCK.read_text(encoding="utf-8").strip()[:90], style="red"
            )

        return Group(
            bar,
            Text(""),
            Panel(
                table,
                title=f"{shards} worker(s)",
                title_align="left",
                border_style="dim",
            ),
            summary,
            state,
        )


def main() -> int:
    console = Console()
    watcher = Watcher()
    if not watcher.keys:
        console.print("[dim]no keys file; watching a single worker[/dim]")

    stop = threading.Event()

    def poll_quotas() -> None:
        while not stop.is_set():
            watcher.refresh_quotas()
            stop.wait(QUOTA_EVERY)

    if watcher.keys:
        # Once before the display opens, so the first frame carries real numbers
        # rather than a column of "asking" that a short visit never sees filled.
        with console.status("[dim]checking what each key has left[/dim]"):
            watcher.refresh_quotas()
        threading.Thread(target=poll_quotas, daemon=True).start()

    finished = pass_.rows_done() >= pass_.TARGET_ROWS
    try:
        with Live(watcher.render(), console=console, refresh_per_second=4) as live:
            while pass_.rows_done() < pass_.TARGET_ROWS:
                finished = False
                time.sleep(REFRESH_SECONDS)
                live.update(watcher.render())
            live.update(watcher.render())

            if finished:
                # Nothing left to watch. Exiting here would close the window
                # before it could be read, which is indistinguishable from the
                # thing being broken.
                console.print("\n[bold green]The corpus is complete.[/bold green]")
            else:
                console.print("\n[bold green]Finished while you watched.[/bold green]")
            console.print("[dim]Ctrl+C to close.[/dim]")
            while True:
                time.sleep(REFRESH_SECONDS)
                live.update(watcher.render())
    except KeyboardInterrupt:
        console.print("\n[dim]closed; the pass is unaffected[/dim]")
    finally:
        stop.set()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
