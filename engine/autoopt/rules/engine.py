"""Forward chaining production system.

The dataflow analyses do not decide anything. They assert facts into working
memory, and rules fire over those facts to produce opportunities. Keeping the two
apart is what makes the Code Analysis Specialist a rule system rather than a pile
of special cases: adding an optimization means adding a rule, not editing an
analysis.

Every opportunity records which facts caused it, so the decision log can show why
the agent thought a transformation applied, not just that it did.

Conflict resolution is by rule priority then by site index. Deterministic, because
the whole experiment depends on runs being repeatable.
"""

from __future__ import annotations

from abc import ABC, abstractmethod
from collections import defaultdict
from collections.abc import Iterator
from dataclasses import dataclass, field
from typing import Any

from ..events import OptimizationType

Value = str | int


@dataclass(frozen=True, slots=True)
class Fact:
    """One assertion, e.g. dead_after(dead, 6)."""

    predicate: str
    args: tuple[Value, ...]

    @property
    def id(self) -> str:
        return f"{self.predicate}({', '.join(str(a) for a in self.args)})"

    def __str__(self) -> str:
        return self.id


class WorkingMemory:
    """Facts, indexed by predicate so rules can query rather than scan."""

    def __init__(self) -> None:
        self._by_predicate: dict[str, list[Fact]] = defaultdict(list)

    def assert_fact(self, predicate: str, *args: Value) -> Fact:
        fact = Fact(predicate=predicate, args=tuple(args))
        self._by_predicate[predicate].append(fact)
        return fact

    def query(self, predicate: str, **positions: Value) -> list[Fact]:
        """Facts for a predicate, optionally filtered by argument position.

        Positions are named arg0, arg1 and so on, which keeps the call sites
        readable without needing a schema per predicate.
        """
        candidates = self._by_predicate.get(predicate, [])
        if not positions:
            return list(candidates)

        wanted = {int(name[3:]): value for name, value in positions.items()}
        return [
            fact
            for fact in candidates
            if all(
                index < len(fact.args) and fact.args[index] == value
                for index, value in wanted.items()
            )
        ]

    def has(self, predicate: str, **positions: Value) -> bool:
        return bool(self.query(predicate, **positions))

    def first(self, predicate: str, **positions: Value) -> Fact | None:
        found = self.query(predicate, **positions)
        return found[0] if found else None

    def __len__(self) -> int:
        return sum(len(facts) for facts in self._by_predicate.values())

    @property
    def predicates(self) -> list[str]:
        return sorted(self._by_predicate)


@dataclass(frozen=True, slots=True)
class Opportunity:
    """A transformation that the facts say applies at a particular instruction.

    `detail` carries whatever the transformation needs and the rule already worked
    out, so the transformation does not repeat the analysis. For CSE that is the
    variable already holding the value; for folding it is the computed constant.
    """

    kind: OptimizationType
    site: int
    derived_from: tuple[str, ...]
    detail: dict[str, Any] = field(default_factory=dict)

    def __str__(self) -> str:
        return f"{self.kind.value} at {self.site}"


class Rule(ABC):
    """A production. `condition` is prose for the decision log, not executable."""

    name: str
    kind: OptimizationType
    condition: str
    #: Lower fires first. Cheap and always-safe transformations go first so the
    #: agent does the obvious work before the speculative work.
    priority: int = 50

    @abstractmethod
    def fire(self, memory: WorkingMemory) -> Iterator[Opportunity]:
        """Yield an opportunity for every match in working memory."""


class RuleEngine:
    def __init__(self, rules: list[Rule]) -> None:
        self.rules = rules

    def run(self, memory: WorkingMemory) -> list[Opportunity]:
        """Fire every rule and return the agenda in resolution order."""
        agenda: list[tuple[int, int, Opportunity]] = []
        for rule in self.rules:
            for opportunity in rule.fire(memory):
                agenda.append((rule.priority, opportunity.site, opportunity))

        agenda.sort(key=lambda entry: (entry[0], entry[1], entry[2].kind.value))
        return [opportunity for _, _, opportunity in agenda]
