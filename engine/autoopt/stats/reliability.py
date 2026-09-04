"""Module 7: reliability.

The agent's architecture maps onto reliability theory without being forced into
it, which is why this module works as coursework rather than as an analogy.

Acceptance requires two things to hold at once, so it is a series system:

    R_system = R_verify x R_cost

Verification uses two independent channels and needs only one to catch a bad
transformation, so detection is a parallel system:

    R_detect = 1 - (1 - R_diff)(1 - R_smt)

The rest follows the same way. A rejected proposal is a failure the agent
recovers from by proposing something else, which gives an MTTR; iterations
between rejections give an MTBF; and the fraction of iterations that produced an
accepted change is availability.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import cast

import numpy as np
import pandas as pd


class MissingMutationStudyError(RuntimeError):
    """Raised when a reliability figure needs measured detection rates."""


@dataclass(frozen=True, slots=True)
class SeriesSystem:
    """Acceptance: verified AND cheaper. Both must hold, so reliabilities multiply."""

    r_verify: float
    r_cost: float

    @property
    def reliability(self) -> float:
        return self.r_verify * self.r_cost

    @property
    def unreliability(self) -> float:
        return 1 - self.reliability

    def describe(self) -> str:
        return (
            f"R_system = R_verify x R_cost = {self.r_verify:.4f} x {self.r_cost:.4f} "
            f"= {self.reliability:.4f}"
        )


@dataclass(frozen=True, slots=True)
class ParallelSystem:
    """Two verification channels. Either one catching a fault is enough."""

    r_channel_a: float
    r_channel_b: float
    name_a: str = "differential testing"
    name_b: str = "Z3 equivalence"

    @property
    def reliability(self) -> float:
        return 1 - (1 - self.r_channel_a) * (1 - self.r_channel_b)

    @property
    def improvement_over_best_single(self) -> float:
        return self.reliability - max(self.r_channel_a, self.r_channel_b)

    def describe(self) -> str:
        return (
            f"R_detect = 1 - (1-{self.r_channel_a:.4f})(1-{self.r_channel_b:.4f}) "
            f"= {self.reliability:.4f}"
        )


def series_system(frame: pd.DataFrame) -> SeriesSystem:
    proposals = float(frame["proposals"].sum())
    refuted = float(frame["refuted"].sum())
    improving = float(frame["cost_improving"].sum())
    verified = proposals - refuted
    return SeriesSystem(
        r_verify=verified / proposals if proposals else 0.0,
        r_cost=improving / verified if verified else 0.0,
    )


def hazard_by_iteration(frame: pd.DataFrame, max_iteration: int = 15) -> pd.DataFrame:
    """Hazard function: probability a run stops at iteration k given it reached k.

    Convergence is the "failure" event here, in the reliability sense of the
    process ending. A rising hazard means runs become more likely to finish the
    longer they have already gone, which is what a search running out of
    opportunities should look like.
    """
    steps = frame["accepted"].dropna().astype(int)
    rows = []
    for k in range(max_iteration + 1):
        at_risk = int((steps >= k).sum())
        failures = int((steps == k).sum())
        if at_risk == 0:
            continue
        hazard = failures / at_risk
        rows.append(
            {
                "iteration": k,
                "at_risk": at_risk,
                "converged_here": failures,
                "hazard": hazard,
                "survival": float((steps > k).sum() / len(steps)),
            }
        )
    return pd.DataFrame(rows)


def maintainability(frame: pd.DataFrame) -> dict[str, float]:
    """MTBF, MTTR and availability, in the agent's own terms.

    A rejected proposal is a fault; the agent repairs it by proposing something
    else. Mean proposals between accepted changes is MTBF, mean rejections before
    the next acceptance is MTTR, and availability is the share of proposals that
    were productive.
    """
    proposals = float(frame["proposals"].sum())
    accepted = float(frame["accepted"].sum())
    rejected = proposals - accepted

    mtbf = proposals / accepted if accepted else float("inf")
    mttr = rejected / accepted if accepted else float("inf")
    availability = mtbf / (mtbf + mttr) if np.isfinite(mtbf + mttr) and (mtbf + mttr) else 0.0

    return {
        "total_proposals": proposals,
        "accepted": accepted,
        "rejected": rejected,
        "MTBF_proposals_per_acceptance": mtbf,
        "MTTR_rejections_per_acceptance": mttr,
        "availability": availability,
        "productive_fraction": accepted / proposals if proposals else 0.0,
    }


def system_reliability(frame: pd.DataFrame) -> dict[str, object]:
    """End to end: a run converging with no false positive.

    The false positive term is the one the spec requires to be zero, and it is
    measured from the output match column rather than assumed.
    """
    runs = len(frame)
    matched = int((frame["output_match"] == 1).sum())
    converged = int((frame["accepted"] > 0).sum())

    series = series_system(frame)
    r_correct = matched / runs if runs else 0.0

    return {
        "runs": runs,
        "R_verify": series.r_verify,
        "R_cost": series.r_cost,
        "R_acceptance_series": series.reliability,
        "R_output_correct": r_correct,
        "false_positive_rate": 1 - r_correct,
        "R_converged": converged / runs if runs else 0.0,
        "R_end_to_end": r_correct * (converged / runs if runs else 0.0),
        "description": series.describe(),
    }


def channel_reliability(study: dict[str, object] | None) -> ParallelSystem:
    """Detection reliability of the two verification channels in parallel.

    Both figures come from the mutation study, because the run data cannot supply
    them. Every transformation in the catalogue is correct, so nothing in the grid
    was ever refuted, and a rate computed from the runs would be zero refutations
    over a hundred thousand proposals: a statement about how good the proposer is,
    not about how good the checkers are.

    Reliability here is conditional on a fault existing, so the denominator has to
    be faults. The mutation study makes them, which is the only way to get one.
    """
    if study is None:
        raise MissingMutationStudyError(
            "Detection reliability needs the mutation study. Run: autoopt mutants"
        )

    differential = cast(dict[str, float], study["differential"])
    smt = cast(dict[str, float], study["smt"])
    return ParallelSystem(
        r_channel_a=float(differential["rate"]),
        r_channel_b=float(smt["rate"]),
    )


def refutation_rate(frame: pd.DataFrame) -> dict[str, float]:
    """Share of proposals verification threw out.

    Not a detection rate. This measures the proposer: how often the rule engine
    suggested something the checkers would not accept. Zero here means the rules
    are sound on this corpus, and says nothing either way about the checkers.
    """
    proposals = float(frame["proposals"].sum())
    refuted = float(frame["refuted"].sum())
    return {
        "proposals": proposals,
        "refuted": refuted,
        "rate": refuted / proposals if proposals else 0.0,
    }


def reliability_block_diagram() -> str:
    """The architecture as a block diagram, for the report."""
    return """
    proposal
       |
       v
    +---------------------------------------+
    |  detection, parallel                  |
    |    +-----------------------------+    |
    |    |  differential testing       |    |
    |    +-----------------------------+    |
    |    +-----------------------------+    |
    |    |  Z3 equivalence checking    |    |
    |    +-----------------------------+    |
    +---------------------------------------+
       |  R_detect = 1 - (1-Ra)(1-Rb)
       v
    +---------------+     +---------------+
    |  verified?    | --> |  cheaper?     |   series
    +---------------+     +---------------+
       |  R_system = R_verify x R_cost
       v
    accepted
    """.strip()
