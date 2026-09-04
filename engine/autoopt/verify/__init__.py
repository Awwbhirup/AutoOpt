"""Verification Module.

Two independent channels. Differential testing runs both programs on concrete
inputs and can only refute. SMT symbolically covers every path within a bound and
can prove, over the supported subset of the IR.

A candidate is accepted only if neither channel refutes it. Differential runs
first because it is fast and finds most breakage; SMT runs afterwards to upgrade
a pass into a proof where it can. Skipping SMT once differential has already
refuted changes nothing, since the candidate is rejected either way.
"""

from __future__ import annotations

from dataclasses import dataclass

from ..events import VerificationMethod, VerificationVerdict
from ..ir.tac import TacProgram
from .differential import (
    DEFAULT_RANDOM_CASES,
    EDGE_VALUES,
    FAST,
    THOROUGH,
    Counterexample,
    DifferentialReport,
    Profile,
    compare,
    input_vectors,
)
from .smt import SmtReport, SmtVerdict, check_equivalence

__all__ = [
    "DEFAULT_RANDOM_CASES",
    "EDGE_VALUES",
    "FAST",
    "THOROUGH",
    "Counterexample",
    "DifferentialReport",
    "Profile",
    "SmtReport",
    "SmtVerdict",
    "VerificationOutcome",
    "check_equivalence",
    "compare",
    "input_vectors",
    "verify",
]


@dataclass(frozen=True, slots=True)
class VerificationOutcome:
    """What the Verification Module reports to the orchestrator."""

    verdict: VerificationVerdict
    method: VerificationMethod
    inputs_tested: int
    differential: DifferentialReport
    smt: SmtReport | None = None
    counterexample: dict[str, int] | None = None
    detail: str = ""

    @property
    def refuted(self) -> bool:
        return self.verdict is VerificationVerdict.COUNTEREXAMPLE_FOUND

    @property
    def proven(self) -> bool:
        return self.verdict is VerificationVerdict.PROVEN_EQUIVALENT


def verify(
    original: TacProgram,
    candidate: TacProgram,
    *,
    seed: int = 0,
    random_cases: int | None = None,
    use_smt: bool = True,
    smt_timeout_ms: int = 5000,
    profile: Profile = THOROUGH,
) -> VerificationOutcome:
    """Run both channels and combine them into one verdict."""
    report = compare(original, candidate, seed=seed, random_cases=random_cases, profile=profile)

    if report.refuted:
        assert report.counterexample is not None
        return VerificationOutcome(
            verdict=VerificationVerdict.COUNTEREXAMPLE_FOUND,
            method=VerificationMethod.DIFFERENTIAL_TESTING,
            inputs_tested=report.cases_run,
            differential=report,
            counterexample=report.counterexample.inputs,
            detail=report.counterexample.describe(),
        )

    if not use_smt:
        return VerificationOutcome(
            verdict=VerificationVerdict.TESTS_PASSED,
            method=VerificationMethod.DIFFERENTIAL_TESTING,
            inputs_tested=report.cases_run,
            differential=report,
        )

    proof = check_equivalence(original, candidate, timeout_ms=smt_timeout_ms)

    if proof.refutes:
        # Differential sampled inputs and found nothing; SMT searched all of them
        # within the bound and did. That is the case the second channel exists for.
        return VerificationOutcome(
            verdict=VerificationVerdict.COUNTEREXAMPLE_FOUND,
            method=VerificationMethod.SMT_Z3,
            inputs_tested=report.cases_run,
            differential=report,
            smt=proof,
            counterexample=proof.counterexample,
            detail=proof.detail,
        )

    if proof.proves_equivalence:
        return VerificationOutcome(
            verdict=VerificationVerdict.PROVEN_EQUIVALENT,
            method=VerificationMethod.SMT_Z3,
            inputs_tested=report.cases_run,
            differential=report,
            smt=proof,
        )

    # Tests passed but the proof was incomplete. Reported as bounded rather than
    # as a proof, which is the honest answer and the one the report quotes.
    return VerificationOutcome(
        verdict=VerificationVerdict.UNKNOWN_BOUNDED,
        method=VerificationMethod.SMT_Z3,
        inputs_tested=report.cases_run,
        differential=report,
        smt=proof,
        detail=proof.detail,
    )
