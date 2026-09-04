"""The search methods compared in the experiment.

Six levels of the `method` factor. In the two-way ANOVA this is the treatment and
program category is the block, so the point of having several is that the
differences between them are what gets tested.

Two are baselines that obey the spec's step-by-step rule literally, and four
cross cost neutral ground, which is where the phase ordering gap shows up.
"""

from __future__ import annotations

import heapq
import math
import random

from ..ir import TacProgram, build_cfg
from ..rules import analyse
from ..transforms import apply
from .base import Environment, SearchResult, Strategy


class FixedPipeline(Strategy):
    """Textbook pass ordering, applied until it stops paying.

    The control that a real compiler resembles: no search at all, just a fixed
    sequence run to a fixed point.
    """

    name = "fixed_pipeline"

    ORDER = (
        "constant_folding",
        "algebraic_simplification",
        "constant_propagation",
        "copy_propagation",
        "common_subexpression_elimination",
        "strength_reduction",
        "dead_code_elimination",
        "loop_invariant_code_motion",
    )

    def search(self, start: TacProgram, env: Environment, *, max_iterations: int) -> SearchResult:
        current, applied, iterations = start, [], 0

        for kind in self.ORDER:
            while iterations < max_iterations:
                candidates = [m for m in env.improving(current) if m.kind.value == kind]
                if not candidates:
                    break
                current = candidates[0].program
                applied.append(kind)
                iterations += 1

        return SearchResult(current, env.cost(current), applied, iterations, env.stats)


class Greedy(Strategy):
    """First improving move, repeatedly. The spec's rule taken literally."""

    name = "greedy"

    def search(self, start: TacProgram, env: Environment, *, max_iterations: int) -> SearchResult:
        current, applied, iterations = start, [], 0

        while iterations < max_iterations:
            moves = env.improving(current)
            if not moves:
                break
            current = moves[0].program
            applied.append(moves[0].kind.value)
            iterations += 1

        return SearchResult(current, env.cost(current), applied, iterations, env.stats)


class RandomBaseline(Strategy):
    """Random improving move. Separates search from luck.

    Without it, any method beating greedy could be explained by exploring more
    states rather than by choosing better ones.
    """

    name = "random_baseline"

    def __init__(self, seed: int = 0) -> None:
        self.seed = seed

    def search(self, start: TacProgram, env: Environment, *, max_iterations: int) -> SearchResult:
        rng = random.Random(self.seed)
        current, applied, iterations = start, [], 0

        while iterations < max_iterations:
            moves = env.improving(current)
            if not moves:
                break
            chosen = moves[rng.randrange(len(moves))]
            current = chosen.program
            applied.append(chosen.kind.value)
            iterations += 1

        return SearchResult(current, env.cost(current), applied, iterations, env.stats)


class AStar(Strategy):
    """Best-first search over program states.

    f = cost(state) - estimated remaining saving. The heuristic is the total
    saving still available one step out, which is optimistic in the sense that it
    assumes every remaining opportunity pays off; that keeps the frontier ordered
    towards states with room left rather than states that merely look cheap now.

    Because it searches over states rather than steps, a two step path with a net
    gain is found even when neither step alone passes the cost gate. That is what
    it is here to demonstrate.
    """

    name = "astar"
    crosses_plateaus = True

    def __init__(self, node_budget: int = 96) -> None:
        self.node_budget = node_budget
        self._estimates: dict[str, float] = {}

    def _heuristic(self, program: TacProgram, env: Environment) -> float:
        """Optimistic estimate of the saving still available, one step out.

        Applies each opportunity and costs the result, but deliberately does not
        verify any of them. Applying is list manipulation and costing is one CFG
        walk; verification is the expensive part, and asking for it here made
        pushing a node cost a full expansion.

        Nothing unsafe follows from skipping verification, because this value only
        orders the frontier. A candidate still has to pass env.successors, which
        does verify, before it can be moved to.
        """
        key = program.canonical_hash()
        cached = self._estimates.get(key)
        if cached is not None:
            return cached

        current = env.cost(program)
        best = current
        for opportunity in analyse(build_cfg(program)):
            candidate = apply(program, opportunity)
            if candidate is not None:
                best = min(best, env.cost(candidate))

        estimate = max(0.0, current - best)
        self._estimates[key] = estimate
        return estimate

    def search(self, start: TacProgram, env: Environment, *, max_iterations: int) -> SearchResult:
        start_cost = env.cost(start)
        best, best_cost, best_path = start, start_cost, []

        counter = 0
        frontier: list[tuple[float, int, float, TacProgram, list[str]]] = [
            (start_cost - self._heuristic(start, env), counter, start_cost, start, [])
        ]
        seen: set[str] = {start.canonical_hash()}
        expanded = 0

        while frontier and expanded < min(self.node_budget, max_iterations):
            _, _, cost, program, path = heapq.heappop(frontier)
            expanded += 1

            if cost < best_cost:
                best, best_cost, best_path = program, cost, path

            for move in env.successors(program):
                key = move.program.canonical_hash()
                if key in seen:
                    continue
                seen.add(key)

                # Uphill moves are never worth following; equal cost ones are,
                # since they are exactly the plateau steps greedy cannot take.
                if move.cost > cost:
                    continue

                counter += 1
                heapq.heappush(
                    frontier,
                    (
                        move.cost - self._heuristic(move.program, env),
                        counter,
                        move.cost,
                        move.program,
                        [*path, move.kind.value],
                    ),
                )

        env.stats.states_seen = len(seen)
        # Only report an improvement; never return something worse than the input.
        if best_cost >= start_cost:
            return SearchResult(start, start_cost, [], expanded, env.stats)
        return SearchResult(best, best_cost, best_path, expanded, env.stats)


class HillClimbing(Strategy):
    """Steepest descent with sideways moves and random restarts.

    Sideways moves are capped, or a chain of equal cost rewrites can wander
    indefinitely without ever reaching a saving.
    """

    name = "hill_climbing"
    crosses_plateaus = True

    def __init__(self, restarts: int = 3, sideways_limit: int = 4, seed: int = 0) -> None:
        self.restarts = restarts
        self.sideways_limit = sideways_limit
        self.seed = seed

    def search(self, start: TacProgram, env: Environment, *, max_iterations: int) -> SearchResult:
        rng = random.Random(self.seed)
        start_cost = env.cost(start)
        best, best_cost, best_path = start, start_cost, []
        iterations = 0

        for attempt in range(self.restarts):
            current, sideways = start, 0
            path: list[str] = []

            while iterations < max_iterations:
                moves = env.successors(current)
                if not moves:
                    break

                current_cost = env.cost(current)
                downhill = [m for m in moves if m.cost < current_cost]
                level = [m for m in moves if m.cost == current_cost]

                if downhill:
                    chosen, sideways = downhill[0], 0
                elif level and sideways < self.sideways_limit:
                    # First restart is deterministic so the method has a stable
                    # baseline; later ones diversify.
                    chosen = level[0] if attempt == 0 else level[rng.randrange(len(level))]
                    sideways += 1
                else:
                    break

                current = chosen.program
                path = [*path, chosen.kind.value]
                iterations += 1

                if env.cost(current) < best_cost:
                    best, best_cost, best_path = current, env.cost(current), list(path)

            if iterations >= max_iterations:
                break

        env.stats.restarts = self.restarts
        return SearchResult(best, best_cost, best_path, iterations, env.stats)


class SimulatedAnnealing(Strategy):
    """Accepts worse states early, tightening as temperature falls.

    Uphill acceptance is what lets it leave a local optimum that hill climbing
    would sit in. The best state seen is remembered separately, so wandering
    never costs the result.
    """

    name = "simulated_annealing"
    crosses_plateaus = True

    def __init__(
        self,
        initial_temperature: float = 0.08,
        cooling: float = 0.88,
        seed: int = 0,
    ) -> None:
        self.initial_temperature = initial_temperature
        self.cooling = cooling
        self.seed = seed

    def search(self, start: TacProgram, env: Environment, *, max_iterations: int) -> SearchResult:
        rng = random.Random(self.seed)
        current, current_cost = start, env.cost(start)
        best, best_cost, best_path = current, current_cost, []
        path: list[str] = []

        temperature = self.initial_temperature
        iterations = 0

        while iterations < max_iterations and temperature > 1e-4:
            moves = env.successors(current)
            if not moves:
                break

            chosen = moves[rng.randrange(len(moves))]
            delta = chosen.cost - current_cost

            if delta <= 0 or rng.random() < math.exp(-delta / temperature):
                current, current_cost = chosen.program, chosen.cost
                path = [*path, chosen.kind.value]
                if current_cost < best_cost:
                    best, best_cost, best_path = current, current_cost, list(path)

            temperature *= self.cooling
            iterations += 1

        return SearchResult(best, best_cost, best_path, iterations, env.stats)


def default_strategies(seed: int = 0) -> dict[str, Strategy]:
    strategies: list[Strategy] = [
        FixedPipeline(),
        Greedy(),
        RandomBaseline(seed=seed),
        AStar(),
        HillClimbing(seed=seed),
        SimulatedAnnealing(seed=seed),
    ]
    return {strategy.name: strategy for strategy in strategies}
