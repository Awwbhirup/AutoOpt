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
import llm_pass as pass_

sys.path.insert(0, str(pass_.ENGINE))
from autoopt.datagen import generate
from autoopt.experiment import select_shard

REFRESH_SECONDS = 2.0
#: How often to ask a key what it has left. Rare, because asking costs a request
#: against the very budget being reported.
QUOTA_EVERY = 60.0
#: Rate is averaged over this much history rather than since the start, so a
#: worker running out of allowance shows up as a slowdown within a minute or two
#: instead of being hidden behind a good first hour.
RATE_WINDOW_SECONDS = 180.0

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
    #: Which programs belong to which worker. Asked of the engine so the split
    #: shown here is the split actually being run, not a second guess at it.
    slices: dict[int, set[str]] = field(default_factory=dict)
    started_per_shard: dict[int, int] = field(default_factory=dict)

    def __post_init__(self) -> None:
        self.keys = pass_.api_keys()
        self.started_done = pass_.rows_done()
        shards = max(1, len(self.keys))
        corpus = generate()
        for index in range(shards):
            self.quotas[index] = Quota()
            self.slices[index] = {
                program.program_id for program in select_shard(corpus, index, shards)
            }
            self.started_per_shard[index] = self.answered_by(index)

    def answered_by(self, index: int) -> int:
        """Programs from this worker's own slice that are done.

        Counted against the slice rather than the file, because every shard
        file is seeded with the whole backlog so a worker can skip it. The file
        length would read the same for all six and say nothing.
        """
        shard_file = pass_.shard_output(index) if len(self.keys) > 1 else pass_.OUT
        answered = pass_._programs_in(shard_file) | pass_._programs_in(pass_.OUT)
        return len(answered & self.slices[index])

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
            return "stalled"
        minutes = remaining / rate
        if minutes < 90:
            return f"{minutes:.0f} min"
        return f"{minutes / 60:.1f} hours"

    # --- asking the provider -------------------------------------------------

    def refresh_quotas(self) -> None:
        """One thread, so a slow provider never freezes the display."""
        for index, key in enumerate(self.keys):
            quota = self.quotas[index]
            try:
                response = httpx.post(
                    ENDPOINT,
                    headers={"Authorization": f"Bearer {key}"},
                    json={
                        "model": os.environ.get(
                            "AUTOOPT_GROQ_MODEL", "qwen/qwen3.8-27b"
                        ),
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
        bar.add_task("corpus", total=pass_.TARGET_ROWS, completed=done)

        table = Table(box=None, pad_edge=False, header_style="dim")
        table.add_column("worker", justify="right")
        table.add_column("its slice", justify="right")
        table.add_column("added", justify="right")
        table.add_column("requests left", justify="right")
        table.add_column("", justify="left")

        for index in range(shards):
            answered = self.answered_by(index)
            slice_size = len(self.slices[index])
            gained_here = answered - self.started_per_shard.get(index, 0)
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
            finished = answered >= slice_size
            progress = Text(
                f"{answered} / {slice_size}", style="green" if finished else "white"
            )
            table.add_row(
                str(index),
                progress,
                Text(f"+{gained_here}" if gained_here else "", style="dim"),
                left,
                age_text,
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
        threading.Thread(target=poll_quotas, daemon=True).start()

    try:
        with Live(watcher.render(), console=console, refresh_per_second=4) as live:
            while pass_.rows_done() < pass_.TARGET_ROWS:
                time.sleep(REFRESH_SECONDS)
                live.update(watcher.render())
            live.update(watcher.render())
        console.print("\n[bold green]The corpus is complete.[/bold green]")
    except KeyboardInterrupt:
        console.print("\n[dim]closed; the pass keeps running in the background[/dim]")
    finally:
        stop.set()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
