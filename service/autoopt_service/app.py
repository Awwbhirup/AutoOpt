"""The HTTP surface. Stateless by rule: it stores nothing and owns no user data.

Everything persistent belongs to the application tier, which is the only thing
holding a database. This service receives a program, runs it, streams what
happened, and forgets it.
"""

from __future__ import annotations

import asyncio
import hmac
import json
import logging
import os
import time
from threading import BoundedSemaphore
from typing import Literal
from uuid import uuid4

from autoopt.arms import LLM_ARMS
from autoopt.events import (
    OptimizationType,
    RejectReason,
    VerificationMethod,
    VerificationVerdict,
)
from autoopt.lang import LexError, MiniLangError, ParseError, SemanticError
from autoopt.search import METHOD_NAMES
from fastapi import FastAPI, HTTPException, Request
from fastapi.responses import JSONResponse, Response, StreamingResponse

from .analysis import analyze
from .schemas import (
    AnalyzeRequest,
    AnalyzeResponse,
    HealthResponse,
    MethodInfo,
    MethodsResponse,
    OptimizeRequest,
    RunFailed,
    SourceDiagnostic,
    VocabularyResponse,
    engine_event_kinds,
)
from .streaming import ndjson

app = FastAPI(
    title="AutoOpt compute service",
    version="0.1.0",
    summary="Runs the optimization loop and streams its decision log.",
)

MAX_REQUEST_BYTES = 32_768
REQUEST_TIMEOUT_SECONDS = float(os.getenv("AUTOOPT_REQUEST_TIMEOUT_SECONDS", "120"))
SLOTS = BoundedSemaphore(int(os.getenv("AUTOOPT_MAX_CONCURRENT_REQUESTS", "4")))
logger = logging.getLogger("autoopt_service.requests")
logger.setLevel(logging.INFO)
if not logger.handlers:
    handler = logging.StreamHandler()
    handler.setFormatter(logging.Formatter("%(message)s"))
    logger.addHandler(handler)
logger.propagate = False


@app.middleware("http")
async def request_controls(request: Request, call_next):  # type: ignore[no-untyped-def]
    started = time.monotonic()
    request_id = uuid4().hex
    status_code = 500
    response: Response | None = None
    try:
        token = os.getenv("AUTOOPT_SERVICE_TOKEN")
        if token and request.url.path != "/health":
            supplied = request.headers.get("authorization", "")
            if not hmac.compare_digest(supplied, f"Bearer {token}"):
                response = JSONResponse({"detail": "unauthorized"}, status_code=401)
                status_code = response.status_code
                return response

        if request.method in {"POST", "PUT", "PATCH"}:
            length = request.headers.get("content-length")
            if length is not None and int(length) > MAX_REQUEST_BYTES:
                response = JSONResponse({"detail": "request body too large"}, status_code=413)
                status_code = response.status_code
                return response
            chunks: list[bytes] = []
            size = 0
            async for chunk in request.stream():
                size += len(chunk)
                if size > MAX_REQUEST_BYTES:
                    response = JSONResponse({"detail": "request body too large"}, status_code=413)
                    status_code = response.status_code
                    return response
                chunks.append(chunk)
            request._body = b"".join(chunks)

        response = await call_next(request)
        status_code = response.status_code
        return response
    finally:
        if response is not None:
            response.headers["X-Request-Id"] = request_id
        logger.info(
            json.dumps(
                {
                    "request_id": request_id,
                    "method": request.method,
                    "path": request.url.path,
                    "status": status_code,
                    "duration_ms": round((time.monotonic() - started) * 1000, 2),
                }
            )
        )


@app.post("/analyze", response_model=AnalyzeResponse, tags=["analysis"])
async def analyze_source(request: AnalyzeRequest) -> AnalyzeResponse:
    if not SLOTS.acquire(blocking=False):
        raise HTTPException(status_code=503, detail="compute service is busy")

    def work() -> AnalyzeResponse:
        try:
            return analyze(request.source)
        finally:
            SLOTS.release()

    try:
        return await asyncio.wait_for(asyncio.to_thread(work), timeout=REQUEST_TIMEOUT_SECONDS)
    except TimeoutError as error:
        raise HTTPException(status_code=504, detail="request time budget exceeded") from error
    except MiniLangError as error:
        kind: Literal["lex", "parse", "semantic"]
        if isinstance(error, LexError):
            kind = "lex"
        elif isinstance(error, ParseError):
            kind = "parse"
        elif isinstance(error, SemanticError):
            kind = "semantic"
        else:
            raise
        diagnostic = SourceDiagnostic(
            kind=kind, message=error.message, line=error.line, column=error.column
        )
        raise HTTPException(status_code=422, detail=diagnostic.model_dump()) from error


@app.get("/health", response_model=HealthResponse, tags=["status"])
def health() -> HealthResponse:
    return HealthResponse()


@app.get("/ready", response_model=HealthResponse, tags=["status"])
def ready() -> HealthResponse:
    if not SLOTS.acquire(blocking=False):
        raise HTTPException(status_code=503, detail="compute service is busy")
    SLOTS.release()
    return HealthResponse()


@app.get("/methods", response_model=MethodsResponse, tags=["catalog"])
def methods() -> MethodsResponse:
    """The methods this build can run.

    Taken from the engine's own registry rather than restated, so a model added
    there becomes available here without anything being edited to match.
    """
    model_available = bool(os.getenv("GEMINI_API_KEY") or os.getenv("GROQ_API_KEY"))
    return MethodsResponse(
        methods=[
            MethodInfo(
                name=name,
                kind="llm" if name in LLM_ARMS else "rule_based",
                available=model_available if name in LLM_ARMS else True,
            )
            for name in METHOD_NAMES
        ]
    )


@app.post("/optimize", tags=["optimization"])
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

    if not SLOTS.acquire(blocking=False):
        raise HTTPException(status_code=503, detail="compute service is busy")

    return StreamingResponse(
        ndjson(
            request,
            deadline=time.monotonic() + REQUEST_TIMEOUT_SECONDS,
            on_done=SLOTS.release,
        ),
        media_type="application/x-ndjson",
        headers={
            # Proxies that buffer would defeat the point of streaming it.
            "Cache-Control": "no-store",
            "X-Accel-Buffering": "no",
        },
    )


@app.get("/schema", response_model=VocabularyResponse, tags=["catalog"])
def vocabulary() -> VocabularyResponse:
    """Every enumerated value that can appear in the stream.

    Derived from the engine's own types rather than listed here, so this cannot
    fall behind the thing it describes.
    """
    return VocabularyResponse(
        event_kinds=[*engine_event_kinds(), RunFailed.model_fields["kind"].default],
        optimization_types=[member.value for member in OptimizationType],
        verification_methods=[member.value for member in VerificationMethod],
        verification_verdicts=[member.value for member in VerificationVerdict],
        reject_reasons=[member.value for member in RejectReason],
    )
