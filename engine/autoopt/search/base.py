"""Search environment shared by every method.

A strategy decides which transformation to try next and when to stop. It does not
know how opportunities are found, how candidates are verified, or how cost is
computed; the Environment below does all of that, so adding a method means
writing a selection rule rather than repeating the plumbing.

On the spec's acceptance rule. The spec says to accept a change only if it is
verified correct AND lowers cost. greedy and fixed_pipeline apply that literally,
one step at a time. The search methods apply it to the path: every state they
visit is verified equivalent to the one before it, and the program they finally
return must be strictly cheaper than the original. What they relax is the
requirement that every individual step lower cost, because a cost neutral step
can unlock a saving on the next one. That gap is the phase ordering problem, and
measuring it is the point of comparing methods at all.

Correctness is never relaxed. A candidate that verification refutes is discarded
by every method.
"""

from __future__ import annotations

from abc import ABC, abstractmethod
from collections.abc import Callable
from dataclasses import dataclass, field

from ..cost import CostModel
from ..events import OptimizationType
from ..ir import TacProgram, build_cfg
from ..rules import Opportunity, analyse
from ..transforms import apply
from ..verify import VerificationOutcome


@dataclass(frozen=True, slots=True)
class Move:
    """A verified candidate reachable from some program in one transformation."""

    opportunity: Opportunity
    program: TacProgram
    cost: float

    @property
    def kind(self) -> OptimizationType:
        return self.opportunity.kind


@dataclass
class SearchStats:
    proposals: int = 0
    verified: int = 0
    refuted: int = 0
    stale: int = 0
    nodes_expanded: int = 0
    states_seen: int = 0
    restarts: int = 0


@dataclass
class SearchResult:
    program: TacProgram
    cost: float
    applied: list[str] = field(default_factory=list)
    iterations: int = 0
    stats: SearchStats = field(default_factory=SearchStats)


class Environment:
    """Move generation with verification and costing folded in."""

    def __init__(
        self,
        model: CostModel,
        verify_fn: Callable[[TacProgram, TacProgram], VerificationOutcome],
        stats: SearchStats,
        on_move: Callable[[Opportunity, TacProgram, VerificationOutcome, float, float], None]
        | None = None,
    ) -> None:
        self.model = model
        self.verify_fn = verify_fn
        self.stats = stats
        self.on_move = on_move
        self._cache: dict[str, list[Move]] = {}
        self._verdicts: dict[tuple[str, str], VerificationOutcome] = {}

    def cost(self, program: TacProgram) -> float:
        return self.model.score(program).total

    def successors(self, program: TacProgram) -> list[Move]:
        """Every verified one-step successor, cheapest first.

        Cached by canonical hash, because the search methods revisit states and
        re-verifying the same candidate is the most expensive thing here.
        """
        key = program.canonical_hash()
        if key in self._cache:
            return self._cache[key]

        current_cost = self.cost(program)
        moves: list[Move] = []

        for opportunity in analyse(build_cfg(program)):
            candidate = apply(program, opportunity)
            if candidate is None:
                self.stats.stale += 1
                continue

            self.stats.proposals += 1
            # The same rewrite is reached by several paths, and re-verifying it
            # is the most expensive thing in the search.
            verdict_key = (key, candidate.canonical_hash())
            outcome = self._verdicts.get(verdict_key)
            if outcome is None:
                outcome = self.verify_fn(program, candidate)
                self._verdicts[verdict_key] = outcome
            candidate_cost = self.cost(candidate)

            if self.on_move is not None:
                self.on_move(opportunity, candidate, outcome, current_cost, candidate_cost)

            if outcome.refuted:
                self.stats.refuted += 1
                continue

            self.stats.verified += 1
            moves.append(Move(opportunity=opportunity, program=candidate, cost=candidate_cost))

        moves.sort(key=lambda move: (move.cost, move.opportunity.site, move.kind.value))
        self._cache[key] = moves
        self.stats.nodes_expanded += 1
        return moves

    def improving(self, program: TacProgram) -> list[Move]:
        """Successors that strictly lower cost, which is the spec's gate."""
        threshold = self.cost(program)
        return [move for move in self.successors(program) if move.cost < threshold]


class Strategy(ABC):
    """One way of choosing what to try next."""

    name: str
    #: Whether the method may pass through a state that does not improve cost.
    crosses_plateaus: bool = False

    @abstractmethod
    def search(self, start: TacProgram, env: Environment, *, max_iterations: int) -> SearchResult:
        """Return the best program found."""
