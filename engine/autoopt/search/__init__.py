"""Search methods: the treatment factor in the experiment."""

from __future__ import annotations

from ..arms import LLM_ARMS
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

#: Search methods. The LLM arms are appended from the registry, so adding a
#: model to compare against does not mean editing this tuple.
RULE_METHODS = (
    "fixed_pipeline",
    "greedy",
    "random_baseline",
    "astar",
    "hill_climbing",
    "simulated_annealing",
)

#: The levels of the `method` factor in the experiment.
METHOD_NAMES = (*RULE_METHODS, *LLM_ARMS)


def build_strategy(name: str, seed: int = 0) -> Strategy:
    """Look up a method by name.

    The LLM strategy is imported inside the branch rather than at module level,
    so that nothing constructs a provider chain or touches the network unless an
    LLM method is actually asked for.
    """
    if name in LLM_ARMS:
        from ..llm import LlmStrategy

        return LlmStrategy(name=name, model=LLM_ARMS[name] or None)
    return default_strategies(seed)[name]


__all__ = [
    "LLM_ARMS",
    "METHOD_NAMES",
    "RULE_METHODS",
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
