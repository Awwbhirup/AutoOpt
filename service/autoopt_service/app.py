"""The HTTP surface. Stateless by rule: it stores nothing and owns no user data.

Everything persistent belongs to the application tier, which is the only thing
holding a database. This service receives a program, runs it, streams what
happened, and forgets it.
"""

from __future__ import annotations

from autoopt.arms import LLM_ARMS
from autoopt.search import METHOD_NAMES
from fastapi import FastAPI, HTTPException
from fastapi.responses import StreamingResponse

from .schemas import (
    HealthResponse,
    MethodInfo,
    MethodsResponse,
    OptimizeRequest,
)
from .streaming import ndjson

app = FastAPI(
    title="AutoOpt compute service",
    version="0.1.0",
    summary="Runs the optimization loop and streams its decision log.",
)


@app.get("/health", response_model=HealthResponse)
def health() -> HealthResponse:
    return HealthResponse()


@app.get("/methods", response_model=MethodsResponse)
def methods() -> MethodsResponse:
    """The methods this build can run.

    Taken from the engine's own registry rather than restated, so a model added
    there becomes available here without anything being edited to match.
    """
    return MethodsResponse(
        methods=[
            MethodInfo(name=name, kind="llm" if name in LLM_ARMS else "rule_based")
            for name in METHOD_NAMES
        ]
    )


@app.post("/optimize")
async def optimize_stream(request: OptimizeRequest) -> StreamingResponse:
    """Stream the decision log of one run as newline-delimited JSON.

    An unknown method is refused here, before the stream opens, because it is
    the one error that can be known in advance. Everything else, a program that
    will not parse included, can only be discovered once the run has started and
    so arrives as the stream's last line.
    """
    if request.method not in METHOD_NAMES:
        raise HTTPException(
            status_code=422,
            detail=f"unknown method {request.method!r}; known: {', '.join(METHOD_NAMES)}",
        )

    return StreamingResponse(
        ndjson(request),
        media_type="application/x-ndjson",
        headers={
            # Proxies that buffer would defeat the point of streaming it.
            "Cache-Control": "no-store",
            "X-Accel-Buffering": "no",
        },
    )
