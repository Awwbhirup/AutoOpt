"""Module 1: descriptive statistics.

Central tendency, dispersion, skewness and kurtosis for every response, plus the
same broken down by method and by category so the later inferential work has
something to be compared against.

Skewness matters here rather than being decoration. Cost reduction is bounded
below by zero and has a mass of programs that barely improve, so it is not
symmetric, and knowing that in advance is what justifies checking the normality
assumption before trusting an ANOVA rather than after.
"""

from __future__ import annotations

from dataclasses import dataclass

import pandas as pd
from scipy import stats as sp

#: The measured outcomes the whole analysis is built on.
RESPONSES = {
    "cost_reduction": "cost reduction",
    "accepted": "transformations accepted",
    "iterations": "steps to convergence",
    "nodes_expanded": "states expanded",
    "instructions_removed": "instructions removed",
    "verification_pass_rate": "verification pass rate",
}


@dataclass(frozen=True, slots=True)
class Summary:
    name: str
    n: int
    mean: float
    median: float
    sd: float
    variance: float
    minimum: float
    maximum: float
    q1: float
    q3: float
    skewness: float
    kurtosis: float
    cv: float

    @property
    def iqr(self) -> float:
        return self.q3 - self.q1

    @property
    def constant(self) -> bool:
        """A response with no variation. Verification pass rate is one: nothing
        was ever refuted, so it is 1.0 everywhere and carries no information for
        any test that needs variance."""
        return self.sd == 0.0

    @property
    def shape(self) -> str:
        """Plain reading of the skew, which decides whether the mean is honest."""
        if self.constant:
            return "constant, no variation"
        if abs(self.skewness) < 0.5:
            return "roughly symmetric"
        if self.skewness > 1:
            return "strongly right skewed"
        if self.skewness > 0.5:
            return "right skewed"
        if self.skewness < -1:
            return "strongly left skewed"
        return "left skewed"


def summarise(values: pd.Series, name: str) -> Summary:
    clean = values.dropna().astype(float)
    mean = float(clean.mean())
    sd = float(clean.std(ddof=1)) if len(clean) > 1 else 0.0
    # A constant series has no shape to measure, and scipy warns about
    # catastrophic cancellation rather than returning zero.
    varies = sd > 0
    return Summary(
        name=name,
        n=len(clean),
        mean=mean,
        median=float(clean.median()),
        sd=sd,
        variance=float(clean.var(ddof=1)) if len(clean) > 1 else 0.0,
        minimum=float(clean.min()),
        maximum=float(clean.max()),
        q1=float(clean.quantile(0.25)),
        q3=float(clean.quantile(0.75)),
        skewness=float(sp.skew(clean, bias=False)) if varies and len(clean) > 2 else 0.0,
        kurtosis=float(sp.kurtosis(clean, bias=False)) if varies and len(clean) > 3 else 0.0,
        # Relative dispersion, which lets responses on different scales be
        # compared for how variable they are.
        cv=sd / mean if mean else 0.0,
    )


def overall(frame: pd.DataFrame) -> list[Summary]:
    return [
        summarise(frame[column], label) for column, label in RESPONSES.items() if column in frame
    ]


def by_group(frame: pd.DataFrame, group: str, response: str = "cost_reduction") -> pd.DataFrame:
    """Descriptives per level of a factor, ordered by mean."""
    rows = []
    for level, subset in frame.groupby(group, observed=True):
        summary = summarise(subset[response], str(level))
        rows.append(
            {
                group: str(level),
                "n": summary.n,
                "mean": summary.mean,
                "median": summary.median,
                "sd": summary.sd,
                "min": summary.minimum,
                "max": summary.maximum,
                "skew": summary.skewness,
            }
        )
    return pd.DataFrame(rows).sort_values("mean", ascending=False).reset_index(drop=True)


def as_table(summaries: list[Summary]) -> pd.DataFrame:
    return pd.DataFrame(
        {
            "response": [s.name for s in summaries],
            "n": [s.n for s in summaries],
            "mean": [s.mean for s in summaries],
            "median": [s.median for s in summaries],
            "sd": [s.sd for s in summaries],
            "IQR": [s.iqr for s in summaries],
            "skewness": [s.skewness for s in summaries],
            "kurtosis": [s.kurtosis for s in summaries],
            "shape": [s.shape for s in summaries],
        }
    )
