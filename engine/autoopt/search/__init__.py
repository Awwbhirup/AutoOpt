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

METHOD_NAMES = (
    "fixed_pipeline",
    "greedy",
    "random_baseline",
    "astar",
    "hill_climbing",
    "simulated_annealing",
)

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
    "default_strategies",
]
