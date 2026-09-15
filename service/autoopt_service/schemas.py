"""What crosses the wire, and the limits enforced on it.

The engine's own event models are the response contract, so nothing is
redefined here that the engine already describes. Only the request needs a
shape of its own, since it is the one thing the engine does not produce.
"""

from __future__ import annotations

from typing import Literal, get_args

from autoopt.events import Event
from autoopt.orchestrator import DEFAULT_MAX_ITERATIONS
from autoopt.search import METHOD_NAMES
from pydantic import BaseModel, Field

#: A run has to finish inside the caller's request timeout, and the caller here
#: is a route handler on a serverless host. The cap is on source text rather
#: than on instructions because it has to be checked before parsing.
MAX_SOURCE_CHARS = 8_000

#: Loose enough never to bind on a real program, tight enough that a pathological
#: request cannot occupy a worker indefinitely.
MAX_ITERATIONS_CEILING = 1_000


class OptimizeRequest(BaseModel):
    """One program, one method, one run."""

    source: str = Field(min_length=1, max_length=MAX_SOURCE_CHARS)
    method: str = "greedy"
    seed: int = Field(default=0, ge=0)
    max_iterations: int = Field(default=DEFAULT_MAX_ITERATIONS, ge=1, le=MAX_ITERATIONS_CEILING)
    #: Off by default for the same reason the batch leaves it off: inside the
    #: loop it is slow and returns unknown_bounded on anything with a loop.
    use_smt: bool = False
    #: Proves the original against the final once, at the end, which is the
    #: comparison worth quoting.
    prove_final: bool = False
    node_budget: int | None = Field(default=None, ge=1)
    #: Echoed back in every event so a caller streaming several runs can tell
    #: them apart without tracking connections.
    program_id: str = Field(default="program", max_length=200)
    category: str = Field(default="mixed", max_length=100)


class RunFailed(BaseModel):
    """A failure that happened after the response had already begun.

    Once the first line is on the wire the status code is spent, so a run that
    dies partway cannot report itself as anything but a line in its own stream.
    Given the same shape as an event so a consumer can read one loop.
    """

    kind: Literal["run_failed"] = "run_failed"
    run_id: str
    seq: int
    #: The exception message, which for a bad program is the parse error. Never
    #: a traceback: this is a compute service and its internals are not the
    #: caller's business.
    message: str
    error_type: str


class MethodInfo(BaseModel):
    name: str
    kind: Literal["rule_based", "llm"]


class MethodsResponse(BaseModel):
    """What this deployment can run.

    Read by the application tier to build its method picker, so adding a model
    to the engine's registry offers it to users without a change here.
    """

    methods: list[MethodInfo]


class HealthResponse(BaseModel):
    status: Literal["ok"] = "ok"
    methods: int = Field(default=len(METHOD_NAMES))


class VocabularyResponse(BaseModel):
    """The enumerated values the event stream uses.

    Published so the application tier can be checked against the engine rather
    than hand-copying its enums and hoping. A transformation added to the
    catalog shows up here, and the test on the other side fails until the
    other side knows about it.
    """

    event_kinds: list[str]
    optimization_types: list[str]
    verification_methods: list[str]
    verification_verdicts: list[str]
    reject_reasons: list[str]


def engine_event_kinds() -> list[str]:
    """The `kind` discriminator of every event the engine can emit.

    Read off the union rather than written out, because a list written out is
    one that will eventually be missing whatever was added last.
    """
    kinds: list[str] = []
    for member in get_args(Event):
        annotation = member.model_fields["kind"].annotation
        kinds.append(str(get_args(annotation)[0]))
    return kinds
