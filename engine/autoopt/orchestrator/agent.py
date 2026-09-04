"""Orchestrator: analyse, propose, verify, evaluate, accept or reject, repeat.

The loop the spec is built around. It owns no analysis and no transformation of
its own; it wires the components together, delegates the choice of what to try
next to a search strategy, and records why at every step.

Acceptance is the conjunction the spec states: a change is kept only if
verification did not refute it AND it lowers cost. The two halves are counted
separately, which is what lets the reliability analysis treat acceptance as a
series system rather than one opaque gate.

Nothing is printed. Every step emits an event, and the batch runner, the report
renderer and the web interface all read that one stream, so the numbers in a
report and the numbers in a live demo come from the same producer.
"""

from __future__ import annotations

from dataclasses import dataclass, field

from ..cost import Cost, CostModel, CostWeights
from ..events import (
    CandidateProposed,
    CostEvaluated,
    Decision,
    Event,
    EventSink,
    NullSink,
    OpportunityFound,
    OptimizationType,
    RejectReason,
    RunConverged,
    RunStarted,
    VerificationResult,
)
from ..events import Cost as CostEvent
from ..ir import TacProgram
from ..rules import Opportunity
from ..search import Environment, SearchStats, Strategy, build_strategy
from ..verify import FAST, VerificationOutcome, verify

DEFAULT_MAX_ITERATIONS = 200


@dataclass(frozen=True, slots=True)
class RunConfig:
    method: str = "greedy"
    seed: int = 0
    max_iterations: int = DEFAULT_MAX_ITERATIONS
    #: SMT inside the search loop is slow and returns unknown_bounded on anything
    #: with a loop. The batch leaves it off and proves original against final
    #: once, at the end, which is where a proof is worth quoting.
    use_smt: bool = False
    prove_final: bool = False
    random_cases: int | None = None
    weights: CostWeights | None = None


@dataclass(slots=True)
class RunResult:
    """Everything the spec's metrics table needs from a single run."""

    program_id: str
    category: str
    method: str
    original: TacProgram
    final: TacProgram
    iterations: int
    proposals: int
    verified: int
    refuted: int
    cost_improving: int
    accepted: int
    stale: int
    nodes_expanded: int
    cost_before: float
    cost_after: float
    output_match: bool
    final_proof: str | None = None
    applied: list[str] = field(default_factory=list)
    #: transformation kind -> {proposed, refuted, improving, accepted}.
    #: The spec wants accept/reject/invalid broken down per optimization type,
    #: which totals alone cannot give.
    by_kind: dict[str, dict[str, int]] = field(default_factory=dict)

    @property
    def cost_reduction(self) -> float:
        if self.cost_before == 0:
            return 0.0
        return (self.cost_before - self.cost_after) / self.cost_before

    @property
    def verification_pass_rate(self) -> float:
        """Share of proposals that survived verification, per the spec."""
        return self.verified / self.proposals if self.proposals else 0.0

    @property
    def acceptance_rate(self) -> float:
        """Share of verified proposals that also lowered cost, per the spec."""
        return self.cost_improving / self.verified if self.verified else 0.0


class Orchestrator:
    def __init__(
        self,
        config: RunConfig | None = None,
        sink: EventSink | None = None,
        strategy: Strategy | None = None,
    ) -> None:
        self.config = config or RunConfig()
        self.sink = sink or NullSink()
        self.strategy = strategy or build_strategy(self.config.method, self.config.seed)
        self._seq = 0

    def _emit(self, event: Event) -> None:
        self.sink(event)

    def _next_seq(self) -> int:
        self._seq += 1
        return self._seq

    def run(
        self, program: TacProgram, *, program_id: str = "program", category: str = "mixed"
    ) -> RunResult:
        config = self.config
        model = CostModel.for_program(program, config.weights)
        stats = SearchStats()
        improving_count = 0
        by_kind: dict[str, dict[str, int]] = {}

        def bump(kind: str, field_name: str) -> None:
            entry = by_kind.setdefault(
                kind, {"proposed": 0, "refuted": 0, "improving": 0, "accepted": 0}
            )
            entry[field_name] += 1

        self._emit(
            RunStarted(
                run_id=program_id,
                seq=self._next_seq(),
                iteration=0,
                program_id=program_id,
                category=category,
                method=config.method,
                initial_tac=[str(i) for i in program],
                initial_cost=_cost_event(model.score(program)),
            )
        )

        def check(before: TacProgram, after: TacProgram) -> VerificationOutcome:
            return verify(
                before,
                after,
                seed=config.seed,
                random_cases=config.random_cases,
                use_smt=config.use_smt,
                profile=FAST,
            )

        def record(
            opportunity: Opportunity,
            candidate: TacProgram,
            outcome: VerificationOutcome,
            before_cost: float,
            after_cost: float,
        ) -> None:
            nonlocal improving_count
            step = stats.nodes_expanded
            bump(opportunity.kind.value, "proposed")

            self._emit(
                OpportunityFound(
                    run_id=program_id,
                    seq=self._next_seq(),
                    iteration=step,
                    optimization_type=opportunity.kind,
                    site=opportunity.site,
                    derived_from=list(opportunity.derived_from),
                )
            )
            self._emit(
                CandidateProposed(
                    run_id=program_id,
                    seq=self._next_seq(),
                    iteration=step,
                    optimization_type=opportunity.kind,
                    site=opportunity.site,
                    proposed_tac=[str(i) for i in candidate],
                    source="rule_based",
                    rationale=None,
                )
            )
            self._emit(
                VerificationResult(
                    run_id=program_id,
                    seq=self._next_seq(),
                    iteration=step,
                    method=outcome.method,
                    verdict=outcome.verdict,
                    duration_ms=0.0,
                    inputs_tested=outcome.inputs_tested,
                    counterexample=outcome.counterexample,
                )
            )

            if outcome.refuted:
                bump(opportunity.kind.value, "refuted")
                self._emit(
                    Decision(
                        run_id=program_id,
                        seq=self._next_seq(),
                        iteration=step,
                        accepted=False,
                        optimization_type=opportunity.kind,
                        reject_reason=RejectReason.VERIFICATION_FAILED,
                    )
                )
                return

            improved = after_cost < before_cost
            if improved:
                improving_count += 1
                bump(opportunity.kind.value, "improving")

            self._emit(
                CostEvaluated(
                    run_id=program_id,
                    seq=self._next_seq(),
                    iteration=step,
                    cost_before=_cost_event(model.score(candidate), override=before_cost),
                    cost_after=_cost_event(model.score(candidate), override=after_cost),
                    improved=improved,
                )
            )

            if not improved:
                # Rejected by the step-by-step methods. The search methods may
                # still pass through it, which is the phase ordering gap being
                # measured.
                self._emit(
                    Decision(
                        run_id=program_id,
                        seq=self._next_seq(),
                        iteration=step,
                        accepted=False,
                        optimization_type=opportunity.kind,
                        reject_reason=RejectReason.NO_COST_IMPROVEMENT,
                    )
                )

        environment = Environment(model, check, stats, record)
        outcome = self.strategy.search(program, environment, max_iterations=config.max_iterations)

        for kind in outcome.applied:
            bump(kind, "accepted")
            self._emit(
                Decision(
                    run_id=program_id,
                    seq=self._next_seq(),
                    iteration=outcome.iterations,
                    accepted=True,
                    optimization_type=OptimizationType(kind),
                    reject_reason=None,
                )
            )

        # The reported comparison, and the one the PASS/FAIL verdict comes from.
        # Full edge values, wider range and the full step limit, unlike the fast
        # profile the search itself runs on.
        final_check = verify(program, outcome.program, seed=config.seed, use_smt=False)
        proof: str | None = None
        if config.prove_final:
            proof = verify(program, outcome.program, seed=config.seed, use_smt=True).verdict.value

        self._emit(
            RunConverged(
                run_id=program_id,
                seq=self._next_seq(),
                iteration=outcome.iterations,
                final_tac=[str(i) for i in outcome.program],
                final_cost=_cost_event(model.score(outcome.program)),
                iterations=outcome.iterations,
                proposals=stats.proposals,
                accepted=len(outcome.applied),
                output_match=not final_check.refuted,
            )
        )

        return RunResult(
            program_id=program_id,
            category=category,
            method=config.method,
            original=program,
            final=outcome.program,
            iterations=outcome.iterations,
            proposals=stats.proposals,
            verified=stats.verified,
            refuted=stats.refuted,
            cost_improving=improving_count,
            accepted=len(outcome.applied),
            stale=stats.stale,
            nodes_expanded=stats.nodes_expanded,
            cost_before=model.score(program).total,
            cost_after=outcome.cost,
            output_match=not final_check.refuted,
            final_proof=proof,
            applied=list(outcome.applied),
            by_kind=by_kind,
        )


def _cost_event(cost: Cost, *, override: float | None = None) -> CostEvent:
    return CostEvent(
        instruction_count=cost.raw.instruction_count,
        arithmetic_ops=cost.raw.arithmetic_ops,
        temp_vars=cost.raw.temp_vars,
        execution_time_us=cost.raw.execution_estimate,
        weighted_total=cost.total if override is None else override,
    )


def optimize(
    program: TacProgram,
    *,
    config: RunConfig | None = None,
    sink: EventSink | None = None,
    strategy: Strategy | None = None,
    program_id: str = "program",
    category: str = "mixed",
) -> RunResult:
    return Orchestrator(config, sink, strategy).run(
        program, program_id=program_id, category=category
    )
