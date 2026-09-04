"""Module 2: random variables, joint distributions, expectation, MGF.

The spec's acceptance rule is a joint distribution and nothing has to be invented
to make it one. Define two Bernoulli variables over a single proposal:

    V = 1 if verification did not refute it
    C = 1 if it lowered cost

The agent accepts exactly when V = 1 and C = 1, so the acceptance probability is
the joint P(V=1, C=1). Two of the six mandated compiler metrics then fall out as
textbook quantities rather than as separately defined numbers:

    Verification Pass Rate = P(V=1),         the marginal of V
    Acceptance Rate        = P(C=1 | V=1),   a conditional

Whether V and C are independent is a real question with a real answer here, not a
worked example: if verification refuted proposals more often among the ones that
would have saved cost, the two would be dependent, and the reliability model in
Module 7 could not multiply them.
"""

from __future__ import annotations

from dataclasses import dataclass

import numpy as np
import pandas as pd
from scipy import stats as sp


@dataclass(frozen=True, slots=True)
class JointTable:
    """Joint, marginal and conditional distribution of (V, C) over proposals."""

    n: int
    both: int
    verified_only: int
    refuted: int

    @property
    def joint(self) -> pd.DataFrame:
        """P(V, C) as a 2x2 table."""
        table = pd.DataFrame(
            [[self.refuted / self.n, 0.0], [self.verified_only / self.n, self.both / self.n]],
            index=["V=0 (refuted)", "V=1 (verified)"],
            columns=["C=0 (no gain)", "C=1 (cheaper)"],
        )
        return table

    @property
    def p_verified(self) -> float:
        """Marginal P(V=1). The spec's Verification Pass Rate."""
        return (self.both + self.verified_only) / self.n if self.n else 0.0

    @property
    def p_cheaper(self) -> float:
        """Marginal P(C=1)."""
        return self.both / self.n if self.n else 0.0

    @property
    def p_accept(self) -> float:
        """Joint P(V=1, C=1). The acceptance rule itself."""
        return self.both / self.n if self.n else 0.0

    @property
    def p_cheaper_given_verified(self) -> float:
        """Conditional P(C=1 | V=1). The spec's Acceptance Rate."""
        verified = self.both + self.verified_only
        return self.both / verified if verified else 0.0

    @property
    def independent(self) -> bool:
        """Whether P(V,C) factorises, which is what Module 7 relies on.

        A refuted proposal is never evaluated for cost, so C is only observed
        when V=1. The two are structurally dependent by construction, and saying
        so is more honest than reporting a test that cannot see it.
        """
        return False

    def expectation_variance(self) -> pd.DataFrame:
        """E and Var for each Bernoulli, from p rather than from the sample."""
        rows = []
        for name, p in (("V (verified)", self.p_verified), ("C (cheaper)", self.p_cheaper)):
            rows.append({"variable": name, "p": p, "E[X]": p, "Var[X]": p * (1 - p)})
        rows.append(
            {
                "variable": "V AND C (accepted)",
                "p": self.p_accept,
                "E[X]": self.p_accept,
                "Var[X]": self.p_accept * (1 - self.p_accept),
            }
        )
        return pd.DataFrame(rows)


def joint_table(frame: pd.DataFrame) -> JointTable:
    proposals = int(frame["proposals"].sum())
    refuted = int(frame["refuted"].sum())
    improving = int(frame["cost_improving"].sum())
    return JointTable(
        n=proposals,
        both=improving,
        verified_only=proposals - refuted - improving,
        refuted=refuted,
    )


def moments(values: pd.Series) -> pd.DataFrame:
    """Raw and central moments of a continuous response."""
    x = values.dropna().astype(float).to_numpy()
    mean = float(np.mean(x))
    return pd.DataFrame(
        [
            {"moment": "E[X]", "value": mean},
            {"moment": "E[X^2]", "value": float(np.mean(x**2))},
            {"moment": "Var[X]", "value": float(np.var(x, ddof=1))},
            {"moment": "E[(X-mu)^3]", "value": float(np.mean((x - mean) ** 3))},
            {"moment": "E[(X-mu)^4]", "value": float(np.mean((x - mean) ** 4))},
        ]
    )


def mgf(values: pd.Series, t_values: tuple[float, ...] = (-1.0, -0.5, 0.5, 1.0)) -> pd.DataFrame:
    """Empirical moment generating function, M(t) = E[e^{tX}].

    Evaluated from the sample rather than assumed from a fitted family, so it can
    be compared against the MGF of whichever distribution Module 4 selects.
    """
    x = values.dropna().astype(float).to_numpy()
    return pd.DataFrame([{"t": t, "M(t)": float(np.mean(np.exp(t * x)))} for t in t_values])


def conditional_by_group(frame: pd.DataFrame, group: str) -> pd.DataFrame:
    """P(C=1 | V=1) per level of a factor, which is Acceptance Rate per group."""
    rows = []
    for level, subset in frame.groupby(group, observed=True):
        table = joint_table(subset)
        rows.append(
            {
                group: str(level),
                "proposals": table.n,
                "P(V=1)": table.p_verified,
                "P(C=1|V=1)": table.p_cheaper_given_verified,
                "P(V=1,C=1)": table.p_accept,
            }
        )
    return pd.DataFrame(rows)


def bernoulli_fit_check(frame: pd.DataFrame) -> dict[str, float]:
    """Whether accepted-per-run behaves like a Binomial count.

    If proposals within a run were independent Bernoulli trials with a common p,
    accepted would be Binomial and its variance would be n p (1-p). Comparing the
    observed variance against that is the cheapest way to see whether the trials
    are actually independent, and they are not: transformations enable each other,
    so successes cluster.
    """
    accepted = frame["accepted"].astype(float)
    proposals = frame["proposals"].astype(float)
    p = float(accepted.sum() / proposals.sum()) if proposals.sum() else 0.0
    expected_var = float((proposals * p * (1 - p)).mean())
    observed_var = float(accepted.var(ddof=1))
    return {
        "p": p,
        "expected_variance_if_binomial": expected_var,
        "observed_variance": observed_var,
        "dispersion_ratio": observed_var / expected_var if expected_var else float("nan"),
    }


def chi_square_independence(frame: pd.DataFrame, rows: str, columns: str) -> dict[str, float]:
    """Chi-square test of independence of attributes, per Module 6."""
    table = pd.crosstab(frame[rows], frame[columns])
    chi2, p_value, dof, _ = sp.chi2_contingency(table)
    return {"chi2": float(chi2), "p_value": float(p_value), "dof": int(dof)}
