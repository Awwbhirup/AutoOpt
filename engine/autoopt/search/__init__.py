"""Search methods: the treatment factor in the experiment."""

from __future__ import annotations

from .base import Environment, Move, SearchResult, SearchStats, Strategy
from .strategies import (
    AStar,
    FixedPipeline,
    Greedy,
    HillClimbing,
    RandomBaseline,
    SimulatedAnnealing,
    default_strategies,
)

#: The levels of the `method` factor in the experiment.
METHOD_NAMES = (
    "fixed_pipeline",
    "greedy",
    "random_baseline",
    "astar",
    "hill_climbing",
    "simulated_annealing",
    "llm",
)


def build_strategy(name: str, seed: int = 0) -> Strategy:
    """Look up a method by name.

    The LLM strategy is imported here rather than at module level, so that
    nothing constructs a provider chain or touches the network unless the llm
    method is actually asked for.
    """
    if name == "llm":
        from ..llm import LlmStrategy

        return LlmStrategy()
    return default_strategies(seed)[name]


__all__ = [
    "METHOD_NAMES",
    "AStar",
    "Environment",
    "FixedPipeline",
    "Greedy",
    "HillClimbing",
    "Move",
    "RandomBaseline",
    "SearchResult",
    "SearchStats",
    "SimulatedAnnealing",
    "Strategy",
    "build_strategy",
    "default_strategies",
]
