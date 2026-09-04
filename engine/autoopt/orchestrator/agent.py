"""Orchestrator: analyse, propose, verify, evaluate, accept or reject, repeat.

The loop the spec is built around. It owns no analysis and no transformation of
its own; it decides what to try next and whether to keep the result, and it
records why at every step.

Acceptance is the conjunction the spec states: a change is kept only if
verification did not refute it AND it lowers cost. Both halves are recorded
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
    RejectReason,
    RunConverged,
    RunStarted,
    VerificationResult,
)
from ..events import Cost as CostEvent
from ..ir import TacProgram, build_cfg
from ..rules import Opportunity, analyse
from ..transforms import apply
from ..verify import verify

#: Safety net on the loop itself. Convergence normally happens well inside this;
#: the cap only stops a transformation that undoes another from cycling forever.
DEFAULT_MAX_ITERATIONS = 200


@dataclass(frozen=True, slots=True)
class RunConfig:
    method: str = "greedy"
    seed: int = 0
    max_iterations: int = DEFAULT_MAX_ITERATIONS
    use_smt: bool = True
    random_cases: int = 32
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
    accepted: int
    rejected_verification: int
    rejected_cost: int
    rejected_stale: int
    cost_before: float
    cost_after: float
    output_match: bool
    applied: list[str] = field(default_factory=list)

    @property
    def cost_reduction(self) -> float:
        if self.cost_before == 0:
            return 0.0
        return (self.cost_before - self.cost_after) / self.cost_before

    @property
    def verification_pass_rate(self) -> float:
        return self.verified / self.proposals if self.proposals else 0.0

    @property
    def acceptance_rate(self) -> float:
        """Share of verified proposals that also lowered cost, per the spec."""
        return self.accepted / self.verified if self.verified else 0.0


class Orchestrator:
    def __init__(self, config: RunConfig | None = None, sink: EventSink | None = None) -> None:
        self.config = config or RunConfig()
        self.sink = sink or NullSink()
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

        current = program
        current_cost = model.score(current)

        self._emit(
            RunStarted(
                run_id=program_id,
                seq=self._next_seq(),
                iteration=0,
                program_id=program_id,
                category=category,
                method=config.method,
                initial_tac=[str(i) for i in current],
                initial_cost=_cost_event(current_cost),
            )
        )

        counters = {
            "proposals": 0,
            "verified": 0,
            "accepted": 0,
            "rejected_verification": 0,
            "rejected_cost": 0,
            "rejected_stale": 0,
        }
        applied: list[str] = []
        iteration = 0

        while iteration < config.max_iterations:
            opportunities = analyse(build_cfg(current))
            if not opportunities:
                break

            progressed = False
            for opportunity in opportunities:
                self._emit(
                    OpportunityFound(
                        run_id=program_id,
                        seq=self._next_seq(),
                        iteration=iteration,
                        optimization_type=opportunity.kind,
                        site=opportunity.site,
                        derived_from=list(opportunity.derived_from),
                    )
                )

                outcome = self._try(program_id, iteration, current, opportunity, model, counters)
                if outcome is None:
                    continue

                current, current_cost = outcome
                applied.append(opportunity.kind.value)
                progressed = True
                break

            iteration += 1
            if not progressed:
                break

        final_cost = model.score(current)
        match = verify(
            program,
            current,
            seed=config.seed,
            random_cases=config.random_cases,
            use_smt=False,
        )

        self._emit(
            RunConverged(
                run_id=program_id,
                seq=self._next_seq(),
                iteration=iteration,
                final_tac=[str(i) for i in current],
                final_cost=_cost_event(final_cost),
                iterations=iteration,
                proposals=counters["proposals"],
                accepted=counters["accepted"],
                output_match=not match.refuted,
            )
        )

        return RunResult(
            program_id=program_id,
            category=category,
            method=config.method,
            original=program,
            final=current,
            iterations=iteration,
            proposals=counters["proposals"],
            verified=counters["verified"],
            accepted=counters["accepted"],
            rejected_verification=counters["rejected_verification"],
            rejected_cost=counters["rejected_cost"],
            rejected_stale=counters["rejected_stale"],
            cost_before=model.score(program).total,
            cost_after=final_cost.total,
            output_match=not match.refuted,
            applied=applied,
        )

    def _try(
        self,
        program_id: str,
        iteration: int,
        current: TacProgram,
        opportunity: Opportunity,
        model: CostModel,
        counters: dict[str, int],
    ) -> tuple[TacProgram, Cost] | None:
        """One analyse-propose-verify-evaluate cycle. Returns the new state or None."""
        candidate = apply(current, opportunity)

        if candidate is None:
            # The opportunity was computed against an earlier snapshot and no
            # longer fits. Recorded rather than silently skipped, because the
            # rate of this is worth reporting.
            counters["rejected_stale"] += 1
            self._emit(
                Decision(
                    run_id=program_id,
                    seq=self._next_seq(),
                    iteration=iteration,
                    accepted=False,
                    optimization_type=opportunity.kind,
                    reject_reason=RejectReason.NOT_APPLICABLE,
                )
            )
            return None

        counters["proposals"] += 1
        self._emit(
            CandidateProposed(
                run_id=program_id,
                seq=self._next_seq(),
                iteration=iteration,
                optimization_type=opportunity.kind,
                site=opportunity.site,
                proposed_tac=[str(i) for i in candidate],
                source="rule_based",
                rationale=None,
            )
        )

        outcome = verify(
            current,
            candidate,
            seed=self.config.seed,
            random_cases=self.config.random_cases,
            use_smt=self.config.use_smt,
        )
        self._emit(
            VerificationResult(
                run_id=program_id,
                seq=self._next_seq(),
                iteration=iteration,
                method=outcome.method,
                verdict=outcome.verdict,
                duration_ms=0.0,
                inputs_tested=outcome.inputs_tested,
                counterexample=outcome.counterexample,
            )
        )

        if outcome.refuted:
            counters["rejected_verification"] += 1
            self._emit(
                Decision(
                    run_id=program_id,
                    seq=self._next_seq(),
                    iteration=iteration,
                    accepted=False,
                    optimization_type=opportunity.kind,
                    reject_reason=RejectReason.VERIFICATION_FAILED,
                )
            )
            return None

        counters["verified"] += 1

        before = model.score(current)
        after = model.score(candidate)
        improved = after.total < before.total

        self._emit(
            CostEvaluated(
                run_id=program_id,
                seq=self._next_seq(),
                iteration=iteration,
                cost_before=_cost_event(before),
                cost_after=_cost_event(after),
                improved=improved,
            )
        )

        if not improved:
            # Cost neutral changes are rejected because the spec says so. Some of
            # them would unlock a saving on the next step, which is exactly the
            # phase ordering gap the search methods are measured against.
            counters["rejected_cost"] += 1
            self._emit(
                Decision(
                    run_id=program_id,
                    seq=self._next_seq(),
                    iteration=iteration,
                    accepted=False,
                    optimization_type=opportunity.kind,
                    reject_reason=RejectReason.NO_COST_IMPROVEMENT,
                )
            )
            return None

        counters["accepted"] += 1
        self._emit(
            Decision(
                run_id=program_id,
                seq=self._next_seq(),
                iteration=iteration,
                accepted=True,
                optimization_type=opportunity.kind,
                reject_reason=None,
            )
        )
        return candidate, after


def _cost_event(cost: Cost) -> CostEvent:
    return CostEvent(
        instruction_count=cost.raw.instruction_count,
        arithmetic_ops=cost.raw.arithmetic_ops,
        temp_vars=cost.raw.temp_vars,
        execution_time_us=cost.raw.execution_estimate,
        weighted_total=cost.total,
    )


def optimize(
    program: TacProgram,
    *,
    config: RunConfig | None = None,
    sink: EventSink | None = None,
    program_id: str = "program",
    category: str = "mixed",
) -> RunResult:
    return Orchestrator(config, sink).run(program, program_id=program_id, category=category)
