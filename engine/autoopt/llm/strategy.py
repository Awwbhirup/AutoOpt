"""LLM-driven search strategy.

The model names a transformation and a line; the rule engine supplies the detail
that transformation needs, and the ordinary apply-verify-cost path takes it from
there. So the model chooses what to do next rather than rewriting code directly.

That is a deliberate reading of the spec's Option B, and it is the honest one to
report. Letting a model emit raw TAC would mostly measure whether it can format
three-address code, and the verifier would reject nearly all of it. Asking it
which opportunity to take measures something the project actually cares about:
whether it can identify a real optimization in a program it has not seen.

LLM Validity Rate then means the share of proposals naming a transformation that
genuinely applies at the line given, which is what the spec's metrics table wants
reported.

A rejected proposal does not end the run. The rejection is fed back into the next
prompt and the model is asked again, up to a call budget. Stopping at the first
unusable answer measured how often a first guess lands, which is a different
question from whether the model can drive a sequence of optimizations, and the
second is the one the comparison against the rule-based path is read as making.
"""

from __future__ import annotations

from ..ir import TacProgram, build_cfg
from ..rules import analyse
from ..search.base import Environment, SearchResult, Strategy
from .specialist import LlmSpecialist, Validity


class LlmStrategy(Strategy):
    name = "llm"
    crosses_plateaus = False

    def __init__(
        self,
        specialist: LlmSpecialist | None = None,
        max_calls: int = 12,
        max_consecutive_failures: int = 3,
    ) -> None:
        self.specialist = specialist or LlmSpecialist()
        #: Bounds spend per program. Convergence is usually well inside this.
        self.max_calls = max_calls
        #: Gives up on a program after this many unusable answers in a row, so a
        #: program with nothing left to do does not consume the whole budget
        #: proving it. Reset by any accepted transformation.
        self.max_consecutive_failures = max_consecutive_failures

    def search(self, start: TacProgram, env: Environment, *, max_iterations: int) -> SearchResult:
        current, applied, iterations = start, [], 0
        calls = 0
        ruled_out: list[str] = []
        consecutive_failures = 0

        while iterations < max_iterations and calls < self.max_calls:
            if consecutive_failures >= self.max_consecutive_failures:
                break

            calls += 1
            proposal = self.specialist.propose(current, ruled_out=tuple(ruled_out))

            # "Nothing to do here" is an answer, not a failure, so it stops the
            # run rather than being argued with.
            if proposal.validity is Validity.DECLINED:
                break

            if proposal.opportunity is None:
                # Unparseable, outside the catalog, or a line that does not exist.
                ruled_out.append(proposal.as_ruled_out())
                consecutive_failures += 1
                continue

            named = proposal.opportunity
            available = analyse(build_cfg(current))
            match = next(
                (o for o in available if o.kind is named.kind and o.site == named.site),
                None,
            )
            if match is None:
                # Named a transformation that is not actually available there.
                self.specialist.stats.by_validity["not_available"] = (
                    self.specialist.stats.by_validity.get("not_available", 0) + 1
                )
                ruled_out.append(f"{named.kind.value} at line {named.site}: not applicable there")
                consecutive_failures += 1
                continue

            moves = {(m.kind, m.opportunity.site): m for m in env.successors(current)}
            move = moves.get((match.kind, match.site))
            if move is None or move.cost >= env.cost(current):
                ruled_out.append(f"{named.kind.value} at line {named.site}: does not lower cost")
                consecutive_failures += 1
                continue

            current = move.program
            applied.append(move.kind.value)
            iterations += 1

            # The program changed, so every line number in the rejection list
            # now refers to something else. Carrying them over would rule out
            # transformations the model was never offered.
            ruled_out.clear()
            consecutive_failures = 0

        return SearchResult(current, env.cost(current), applied, iterations, env.stats)
