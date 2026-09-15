"""Turning a synchronous engine run into a stream of lines.

The orchestrator is ordinary blocking code that calls a sink as it goes. To
report a run while it is still happening, it runs on its own thread and the
request coroutine drains what the sink has queued.

The alternative, collecting the events and sending them at the end, would make
the whole feature pointless: the decision trace is worth showing precisely
because it arrives step by step.
"""

from __future__ import annotations

import asyncio
import queue
from collections.abc import AsyncIterator
from threading import Thread

from autoopt.events import Event
from autoopt.ir import source_to_tac
from autoopt.orchestrator import RunConfig, optimize

from .schemas import OptimizeRequest, RunFailed

#: How long to wait before looking at the queue again when it is empty.
#: Imperceptible in a trace a person is watching, and polling rather than
#: blocking keeps this off the thread pool: a blocking get would hold a pool
#: thread for the whole run, and the run itself is already holding one.
POLL_SECONDS = 0.01

#: Bounds how far the producer may run ahead of a slow consumer. Full means the
#: engine thread waits, which is the intended backpressure.
QUEUE_SIZE = 256


class _Done:
    """Sentinel. A class rather than a string so no event can collide with it."""


def _config(request: OptimizeRequest) -> RunConfig:
    return RunConfig(
        method=request.method,
        seed=request.seed,
        max_iterations=request.max_iterations,
        use_smt=request.use_smt,
        prove_final=request.prove_final,
        node_budget=request.node_budget,
    )


async def run_events(request: OptimizeRequest) -> AsyncIterator[Event | RunFailed]:
    """Yield the decision log of one run as it is produced.

    Parse errors surface here rather than before, so a caller sees them the same
    way as any other failure, as the last line of the stream.
    """
    outbox: queue.Queue[Event | type[_Done]] = queue.Queue(maxsize=QUEUE_SIZE)
    failure: list[BaseException] = []

    def sink(event: Event) -> None:
        outbox.put(event)

    def work() -> None:
        try:
            program = source_to_tac(request.source)
            optimize(
                program,
                config=_config(request),
                sink=sink,
                program_id=request.program_id,
                category=request.category,
            )
        except BaseException as error:  # reported as a line, never as a traceback
            failure.append(error)
        finally:
            outbox.put(_Done)

    worker = Thread(target=work, name=f"run-{request.program_id}", daemon=True)
    worker.start()

    seq = 0
    while True:
        try:
            item = outbox.get_nowait()
        except queue.Empty:
            await asyncio.sleep(POLL_SECONDS)
            continue
        if item is _Done:
            break
        assert not isinstance(item, type)
        seq = item.seq
        yield item

    if failure:
        error = failure[0]
        yield RunFailed(
            run_id=request.program_id,
            seq=seq + 1,
            message=str(error),
            error_type=type(error).__name__,
        )


async def ndjson(request: OptimizeRequest) -> AsyncIterator[bytes]:
    """The same stream as newline-delimited JSON, one object per line."""
    async for event in run_events(request):
        yield event.model_dump_json().encode() + b"\n"
