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
from dataclasses import dataclass, field, replace
from enum import StrEnum

from ..events import OptimizationType
from ..ir import TacProgram, build_cfg
from ..rules import Opportunity, analyse
from .provider import Completion, ProviderChain, build_chain

CATALOG = [kind.value for kind in OptimizationType]

PROMPT = """You are optimizing three-address code. Propose exactly ONE \
semantics-preserving transformation.

Allowed transformations (use one of these strings exactly):
{catalog}

Program (each line prefixed by its index):
{listing}
{ruled_out}
Reply with JSON only:
{{"optimization_type": "<one of the allowed strings>",
  "site": <integer line index to transform>,
  "rationale": "<one short sentence>"}}

If nothing can safely be improved, use "none" with site -1.
Do not explain outside the JSON."""

RULED_OUT_BLOCK = """
Already tried on this exact program and rejected. Pick something else:
{items}
"""


class Validity(StrEnum):
    VALID = "valid"
    DECLINED = "declined"
    UNPARSEABLE = "unparseable"
    UNKNOWN_TYPE = "unknown_type"
    BAD_SITE = "bad_site"
    #: Well formed, in the catalogue, real line number, and still wrong: that
    #: transformation does not apply there. This is the interesting failure and
    #: the one the metric is supposed to be about. Emitting JSON is easy; knowing
    #: where in the code a transformation is legal is the actual task.
    NOT_AVAILABLE = "not_available"


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
        """Share of calls that named a transformation that genuinely applies.

        Declining counts as neither valid nor invalid and is excluded, since
        "nothing to do here" is a correct answer rather than a failed one.

        This used to be recorded before applicability was checked, so anything
        well formed counted as valid and the rate read 100%. That measured
        whether the model can emit JSON, which is not the question. A proposal is
        valid only if the transformation it names is actually available at the
        line it gives.
        """
        considered = self.calls - self.by_validity.get(Validity.DECLINED.value, 0)
        return self.by_validity.get(Validity.VALID.value, 0) / considered if considered else 0.0


@dataclass(frozen=True, slots=True)
class Proposal:
    validity: Validity
    opportunity: Opportunity | None = None
    rationale: str = ""
    provider: str = ""
    #: What the model actually said, kept even when it was unusable, so the next
    #: prompt can name it rather than saying "that was wrong" with no referent.
    named_type: str = ""
    named_site: int = -1

    def as_ruled_out(self) -> str:
        """One line telling the model what not to repeat, and why."""
        if self.validity is Validity.UNPARSEABLE:
            return "your previous reply was not valid JSON; reply with JSON only"
        if self.validity is Validity.UNKNOWN_TYPE:
            return f"{self.named_type!r} is not in the allowed list; use one of the strings above"
        if self.validity is Validity.BAD_SITE:
            return f"{self.named_type} at line {self.named_site}: no such line in this program"
        if self.validity is Validity.NOT_AVAILABLE:
            return f"{self.named_type} at line {self.named_site}: not applicable there"
        return f"{self.named_type} at line {self.named_site}"


class LlmSpecialist:
    def __init__(self, chain: ProviderChain | None = None, model: str | None = None) -> None:
        self.chain = chain or build_chain(model=model)
        self.stats = LlmStats()

    def propose(self, program: TacProgram, ruled_out: tuple[str, ...] = ()) -> Proposal:
        """One proposal, told what has already been rejected on this program.

        Temperature is zero, so re-asking an unchanged prompt returns the same
        answer and a retry loop would spin. Feeding the rejections back changes
        the prompt, which is what makes asking again worth anything, and keeps
        the run reproducible and separately cached.
        """
        listing = "\n".join(f"{i}: {instruction}" for i, instruction in enumerate(program))
        block = (
            RULED_OUT_BLOCK.format(items="\n".join(f"- {item}" for item in ruled_out))
            if ruled_out
            else ""
        )
        prompt = PROMPT.format(
            catalog="\n".join(f"- {name}" for name in CATALOG),
            listing=listing,
            ruled_out=block,
        )

        completion = self.chain.complete(prompt)
        proposal = self._confirm(self._parse(completion, program), program)
        self.stats.record(proposal.validity, completion)
        return proposal

    def _confirm(self, proposal: Proposal, program: TacProgram) -> Proposal:
        """Check the named transformation is really available where it was named.

        Done here rather than in the caller so that validity is decided in one
        place, at the moment it is recorded. Splitting the two is how the rate
        came to be counted before the only check that could falsify it.
        """
        if proposal.opportunity is None:
            return proposal

        named = proposal.opportunity
        available = analyse(build_cfg(program))
        if any(o.kind is named.kind and o.site == named.site for o in available):
            return proposal

        return replace(proposal, validity=Validity.NOT_AVAILABLE, opportunity=None)

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
                Validity.UNKNOWN_TYPE,
                rationale=rationale,
                provider=completion.provider,
                named_type=kind_name,
            )

        try:
            site = int(payload.get("site", -1))
        except (TypeError, ValueError):
            return Proposal(
                Validity.BAD_SITE,
                rationale=rationale,
                provider=completion.provider,
                named_type=kind_name,
            )

        if not 0 <= site < len(program):
            return Proposal(
                Validity.BAD_SITE,
                rationale=rationale,
                provider=completion.provider,
                named_type=kind_name,
                named_site=site,
            )

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
            named_type=kind_name,
            named_site=site,
        )
