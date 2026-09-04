"""LLM-based Optimization Specialist, which is Option B in the spec.

Sends the TAC and the catalog, and asks for one semantics-preserving
transformation. The Verification Module still decides whether the result is kept,
so a wrong suggestion costs a point of LLM Validity Rate rather than correctness.

Output is constrained to the eight catalog entries and a site index, not free
form rewriting. Three things follow from that. A hallucinated transformation
becomes a measurable failure mode instead of a parse crash. The proposal goes
through the same apply-verify-cost path as the rule-based one, so the comparison
between them is fair. And the rationale the model returns satisfies the spec's
requirement to report the agent's reasoning at each step, which the rule-based
path can only answer with the fact that fired.

Validity is tracked in the categories the spec's metrics table wants: unparseable,
outside the catalog, inapplicable at the named site, refuted by verification, or
valid.
"""

from __future__ import annotations

import json
from dataclasses import dataclass, field
from enum import StrEnum

from ..events import OptimizationType
from ..ir import TacProgram
from ..rules import Opportunity
from .provider import Completion, ProviderChain, build_chain

CATALOG = [kind.value for kind in OptimizationType]

PROMPT = """You are optimizing three-address code. Propose exactly ONE \
semantics-preserving transformation.

Allowed transformations (use one of these strings exactly):
{catalog}

Program (each line prefixed by its index):
{listing}

Reply with JSON only:
{{"optimization_type": "<one of the allowed strings>",
  "site": <integer line index to transform>,
  "rationale": "<one short sentence>"}}

If nothing can safely be improved, use "none" with site -1.
Do not explain outside the JSON."""


class Validity(StrEnum):
    VALID = "valid"
    DECLINED = "declined"
    UNPARSEABLE = "unparseable"
    UNKNOWN_TYPE = "unknown_type"
    BAD_SITE = "bad_site"


@dataclass
class LlmStats:
    calls: int = 0
    cached: int = 0
    by_validity: dict[str, int] = field(default_factory=dict)
    by_provider: dict[str, int] = field(default_factory=dict)

    def record(self, validity: Validity, completion: Completion) -> None:
        self.calls += 1
        if completion.cached:
            self.cached += 1
        self.by_validity[validity.value] = self.by_validity.get(validity.value, 0) + 1
        self.by_provider[completion.provider] = self.by_provider.get(completion.provider, 0) + 1

    @property
    def validity_rate(self) -> float:
        """Share of calls that produced a usable proposal, per the spec's metric.

        Declining counts as neither valid nor invalid and is excluded, since
        "nothing to do here" is a correct answer rather than a failed one.
        """
        considered = self.calls - self.by_validity.get(Validity.DECLINED.value, 0)
        return self.by_validity.get(Validity.VALID.value, 0) / considered if considered else 0.0


@dataclass(frozen=True, slots=True)
class Proposal:
    validity: Validity
    opportunity: Opportunity | None = None
    rationale: str = ""
    provider: str = ""


class LlmSpecialist:
    def __init__(self, chain: ProviderChain | None = None) -> None:
        self.chain = chain or build_chain()
        self.stats = LlmStats()

    def propose(self, program: TacProgram) -> Proposal:
        listing = "\n".join(f"{i}: {instruction}" for i, instruction in enumerate(program))
        prompt = PROMPT.format(catalog="\n".join(f"- {name}" for name in CATALOG), listing=listing)

        completion = self.chain.complete(prompt)
        proposal = self._parse(completion, program)
        self.stats.record(proposal.validity, completion)
        return proposal

    def _parse(self, completion: Completion, program: TacProgram) -> Proposal:
        text = completion.text.strip()
        # Models sometimes wrap JSON in a fenced block despite being told not to.
        if text.startswith("```"):
            text = text.strip("`")
            text = text[text.find("{") :] if "{" in text else text

        try:
            payload = json.loads(text)
        except (json.JSONDecodeError, ValueError):
            return Proposal(Validity.UNPARSEABLE, provider=completion.provider)

        if not isinstance(payload, dict):
            return Proposal(Validity.UNPARSEABLE, provider=completion.provider)

        kind_name = str(payload.get("optimization_type", "")).strip()
        rationale = str(payload.get("rationale", ""))[:200]

        if kind_name in ("none", ""):
            return Proposal(Validity.DECLINED, rationale=rationale, provider=completion.provider)

        if kind_name not in CATALOG:
            # A transformation the catalog does not contain. Counted, not crashed on.
            return Proposal(
                Validity.UNKNOWN_TYPE, rationale=rationale, provider=completion.provider
            )

        try:
            site = int(payload.get("site", -1))
        except (TypeError, ValueError):
            return Proposal(Validity.BAD_SITE, rationale=rationale, provider=completion.provider)

        if not 0 <= site < len(program):
            return Proposal(Validity.BAD_SITE, rationale=rationale, provider=completion.provider)

        return Proposal(
            Validity.VALID,
            opportunity=Opportunity(
                kind=OptimizationType(kind_name),
                site=site,
                derived_from=("llm_proposal",),
                detail={},
            ),
            rationale=rationale,
            provider=completion.provider,
        )
