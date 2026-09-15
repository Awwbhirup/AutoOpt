"""The stream has to arrive while the run is still going.

Separated from the rest because it needs a real server. The test client
collects the whole response before handing it back, so every assertion made
through it would hold just as well if the service buffered the run and sent it
in one piece, which is the one thing this feature must not do.
"""

from __future__ import annotations

import socket
import threading
import time
from collections.abc import Iterator

import httpx
import pytest
import uvicorn

from autoopt_service.app import app

#: Big enough that the run takes long enough for arrival times to mean
#: something, small enough to stay a unit test.
SOURCE = """
input x;
int a = 2 + 3;
int b = x + a;
int c = x + a;
int d = c * 1;
int e = d + b;
int f = e * 2;
int g = f + c;
int h = g + a;
print(b);
print(d);
print(h);
"""


def free_port() -> int:
    with socket.socket() as sock:
        sock.bind(("127.0.0.1", 0))
        return int(sock.getsockname()[1])


@pytest.fixture(scope="module")
def base_url() -> Iterator[str]:
    port = free_port()
    config = uvicorn.Config(app, host="127.0.0.1", port=port, log_level="warning")
    server = uvicorn.Server(config)
    thread = threading.Thread(target=server.run, daemon=True)
    thread.start()

    deadline = time.monotonic() + 30
    while not server.started and time.monotonic() < deadline:
        time.sleep(0.05)
    if not server.started:
        pytest.fail("server did not start")

    yield f"http://127.0.0.1:{port}"

    server.should_exit = True
    thread.join(timeout=10)


def test_lines_arrive_before_the_run_finishes(base_url: str) -> None:
    """The first line must land well before the last one.

    Buffering the whole run would make these two times equal, which is what
    this is here to catch.
    """
    arrivals: list[float] = []
    with httpx.Client(timeout=120) as client:
        start = time.monotonic()
        with client.stream(
            "POST",
            f"{base_url}/optimize",
            json={"source": SOURCE, "method": "astar", "prove_final": True},
        ) as response:
            assert response.status_code == 200
            for line in response.iter_lines():
                if line.strip():
                    arrivals.append(time.monotonic() - start)

    assert len(arrivals) > 10
    total = arrivals[-1]
    assert total > 0.05, "run finished too fast for this test to mean anything"
    # The first line should be near the beginning rather than near the end.
    assert arrivals[0] < total / 2


def test_the_stream_is_ndjson(base_url: str) -> None:
    with (
        httpx.Client(timeout=120) as client,
        client.stream("POST", f"{base_url}/optimize", json={"source": SOURCE}) as response,
    ):
        assert response.headers["content-type"].startswith("application/x-ndjson")
        # Proxies that buffer would defeat the point of streaming.
        assert response.headers["x-accel-buffering"] == "no"
