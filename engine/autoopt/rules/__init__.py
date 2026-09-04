"""Code Analysis Specialist: dataflow facts in, optimization opportunities out."""

from __future__ import annotations

from ..ir.cfg import ControlFlowGraph
from .catalog import default_rules
from .engine import Fact, Opportunity, Rule, RuleEngine, WorkingMemory
from .facts import build as build_working_memory
from .facts import describe

__all__ = [
    "Fact",
    "Opportunity",
    "Rule",
    "RuleEngine",
    "WorkingMemory",
    "analyse",
    "build_working_memory",
    "default_rules",
    "describe",
]


def analyse(cfg: ControlFlowGraph, rules: list[Rule] | None = None) -> list[Opportunity]:
    """Assert what the analyses found, then fire the rules over it."""
    memory = build_working_memory(cfg)
    return RuleEngine(rules or default_rules()).run(memory)
