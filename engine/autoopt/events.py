"""Decision log event contract.

The engine does no printing, no network and no database writes. It reports what
it did by emitting these through a callback, and the batch runner, the report
renderer and the web app all read the same stream.

Per the spec (Project 5, section 8) each step of the log needs the opportunity
analyzed, what was proposed, the verification result, cost before and after,
and the accept/reject decision. In order that is OpportunityFound,
CandidateProposed, VerificationResult, CostEvaluated, Decision.
"""

from __future__ import annotations

from enum import StrEnum
from typing import Literal, Protocol

from pydantic import BaseModel, Field


class OptimizationType(StrEnum):
    """The catalog. The LLM is constrained to these values, so a proposal outside the
    catalog is a measurable failure mode rather than a parse error."""

    CONSTANT_FOLDING = "constant_folding"
    CONSTANT_PROPAGATION = "constant_propagation"
    COPY_PROPAGATION = "copy_propagation"
    COMMON_SUBEXPRESSION_ELIMINATION = "common_subexpression_elimination"
    DEAD_CODE_ELIMINATION = "dead_code_elimination"
    ALGEBRAIC_SIMPLIFICATION = "algebraic_simplification"
    STRENGTH_REDUCTION = "strength_reduction"
    LOOP_INVARIANT_CODE_MOTION = "loop_invariant_code_motion"


class VerificationMethod(StrEnum):
    DIFFERENTIAL_TESTING = "differential_testing"
    SMT_Z3 = "smt_z3"


class VerificationVerdict(StrEnum):
    """UNKNOWN_BOUNDED is reported honestly rather than being folded into a pass:
    Z3 proves equivalence only up to the unrolling bound for programs with loops."""

    PROVEN_EQUIVALENT = "proven_equivalent"
    TESTS_PASSED = "tests_passed"
    COUNTEREXAMPLE_FOUND = "counterexample_found"
    UNKNOWN_BOUNDED = "unknown_bounded"


class RejectReason(StrEnum):
    VERIFICATION_FAILED = "verification_failed"
    NO_COST_IMPROVEMENT = "no_cost_improvement"
    NOT_APPLICABLE = "not_applicable"
    MALFORMED_PROPOSAL = "malformed_proposal"


class Cost(BaseModel):
    """Weighted cost, per the spec's Cost Evaluator. Weights live in cost/model.py."""

    instruction_count: int
    arithmetic_ops: int
    temp_vars: int
    execution_time_us: float
    weighted_total: float


# --- events -----------------------------------------------------------------


class _Event(BaseModel):
    run_id: str
    seq: int = Field(description="Monotonic within a run; the decision log's ordering key.")
    iteration: int = Field(description="Orchestrator loop number, 0-based.")


class RunStarted(_Event):
    kind: Literal["run_started"] = "run_started"
    program_id: str
    category: str
    method: str
    initial_tac: list[str]
    initial_cost: Cost


class OpportunityFound(_Event):
    """Emitted by the Code Analysis Specialist - one per detected opportunity."""

    kind: Literal["opportunity_found"] = "opportunity_found"
    optimization_type: OptimizationType
    site: int
    derived_from: list[str] = Field(
        default_factory=list,
        description="Fact ids the forward-chaining rule fired on. Makes the reasoning auditable.",
    )


class CandidateProposed(_Event):
    """Emitted by the Optimization Specialist (rule-based or LLM)."""

    kind: Literal["candidate_proposed"] = "candidate_proposed"
    optimization_type: OptimizationType
    site: int
    proposed_tac: list[str]
    source: Literal["rule_based", "llm"]
    rationale: str | None = Field(
        default=None,
        description="Natural-language justification. Supplied by the LLM; satisfies the spec's "
        "requirement to report the agent's reasoning at each step.",
    )


class VerificationResult(_Event):
    kind: Literal["verification_result"] = "verification_result"
    method: VerificationMethod
    verdict: VerificationVerdict
    duration_ms: float
    inputs_tested: int | None = None
    counterexample: dict[str, int] | None = None


class CostEvaluated(_Event):
    kind: Literal["cost_evaluated"] = "cost_evaluated"
    cost_before: Cost
    cost_after: Cost
    improved: bool


class Decision(_Event):
    """The accept/reject gate: accepted only if verified correct AND cheaper.
    That conjunction is the series reliability system analysed in the P&S report."""

    kind: Literal["decision"] = "decision"
    accepted: bool
    optimization_type: OptimizationType
    reject_reason: RejectReason | None = None


class StateExpanded(_Event):
    """Search bookkeeping - powers the search-tree visualization and nodes_expanded."""

    kind: Literal["state_expanded"] = "state_expanded"
    state_hash: str
    parent_hash: str | None
    g_cost: float
    h_estimate: float
    frontier_size: int


class RunConverged(_Event):
    kind: Literal["run_converged"] = "run_converged"
    final_tac: list[str]
    final_cost: Cost
    iterations: int
    proposals: int
    accepted: int
    output_match: bool = Field(description="PASS/FAIL verdict the spec requires per program.")


Event = (
    RunStarted
    | OpportunityFound
    | CandidateProposed
    | VerificationResult
    | CostEvaluated
    | Decision
    | StateExpanded
    | RunConverged
)


class EventSink(Protocol):
    """Implemented by the CSV writer, the report renderer, and the web streamer alike."""

    def __call__(self, event: Event) -> None: ...


class NullSink:
    """Default sink. Keeps the engine silent unless a consumer asks to listen."""

    def __call__(self, event: Event) -> None:
        return None
