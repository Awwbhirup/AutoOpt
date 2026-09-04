"""Module 4: probability distributions and goodness of fit.

Fits the families the syllabus names to the responses they could plausibly have
generated, then picks between them on evidence rather than by eye.

Discrete responses are counts of things that happened per program, so Binomial,
Poisson and Geometric are the candidates. Continuous ones are non-negative and
right skewed, which is the shape Gamma, Exponential, Weibull and Lognormal exist
for; Normal is fitted alongside them precisely so the comparison shows whether
assuming it would have been safe.

Selection uses AIC, which penalises the extra parameter a richer family costs, so
a two-parameter Gamma has to earn its advantage over a one-parameter Exponential
rather than winning automatically for fitting more closely.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any

import numpy as np
import pandas as pd
from scipy import stats as sp

CONTINUOUS_FAMILIES = {
    "normal": sp.norm,
    "gamma": sp.gamma,
    "exponential": sp.expon,
    "weibull": sp.weibull_min,
    "lognormal": sp.lognorm,
}


@dataclass(frozen=True, slots=True)
class Fit:
    family: str
    parameters: tuple[float, ...]
    log_likelihood: float
    aic: float
    bic: float
    ks_statistic: float
    ks_p_value: float
    chi2_statistic: float
    chi2_p_value: float
    chi2_dof: int
    n: int

    @property
    def rejected_at_5pc(self) -> bool:
        """Whether goodness of fit rejects this family."""
        return self.chi2_p_value < 0.05


def _chi_square_gof(
    values: np.ndarray,
    family: Any,
    parameters: tuple[float, ...],
    bins: int,
    estimated: int,
) -> tuple[float, float, int]:
    """Chi-square goodness of fit against a fitted continuous distribution.

    Bins are equiprobable under the fitted model rather than equal width, which
    keeps expected counts even and avoids the sparse tail bins that make the
    statistic unreliable.
    """
    n = len(values)
    quantiles = np.linspace(0, 1, bins + 1)
    edges = family.ppf(quantiles, *parameters)
    edges[0], edges[-1] = -np.inf, np.inf

    observed, _ = np.histogram(values, bins=edges)
    expected = np.full(bins, n / bins)

    # Merge bins with small expectations, since chi-square needs them above five.
    keep = expected >= 5
    if keep.sum() < 3:
        return float("nan"), float("nan"), 0

    statistic = float(((observed[keep] - expected[keep]) ** 2 / expected[keep]).sum())
    # One degree of freedom lost per estimated parameter, plus one for the total.
    dof = int(keep.sum() - 1 - estimated)
    p_value = float(1 - sp.chi2.cdf(statistic, dof)) if dof > 0 else float("nan")
    return statistic, p_value, dof


def fit_continuous(values: pd.Series, bins: int = 10) -> list[Fit]:
    """Fit every continuous family and score them."""
    data = values.dropna().astype(float).to_numpy()
    # Several families are defined only on positive support.
    data = data[np.isfinite(data)]
    if len(data) < 20:
        return []

    shifted = data + 1e-9 if data.min() >= 0 else data
    results: list[Fit] = []

    for name, family in CONTINUOUS_FAMILIES.items():
        try:
            if name in ("gamma", "exponential", "weibull", "lognormal"):
                if shifted.min() <= 0:
                    continue
                parameters = family.fit(shifted, floc=0)
            else:
                parameters = family.fit(shifted)

            log_likelihood = float(np.sum(family.logpdf(shifted, *parameters)))
            if not np.isfinite(log_likelihood):
                continue

            free = len([p for p in parameters if p != 0])
            # The frozen distribution's cdf, not a name and args. Passing a name
            # means the key has to match scipy's own spelling ("norm", not
            # "normal"), and even the right name takes a fast path that rejects
            # the args. Either way kstest raises and the except below swallows it,
            # which is how three of the five families quietly vanished from this
            # comparison.
            ks_stat, ks_p = sp.kstest(shifted, family(*parameters).cdf)
            chi2, chi2_p, dof = _chi_square_gof(shifted, family, parameters, bins, free)

            results.append(
                Fit(
                    family=name,
                    parameters=tuple(float(p) for p in parameters),
                    log_likelihood=log_likelihood,
                    aic=float(2 * free - 2 * log_likelihood),
                    bic=float(free * np.log(len(shifted)) - 2 * log_likelihood),
                    ks_statistic=float(ks_stat),
                    ks_p_value=float(ks_p),
                    chi2_statistic=chi2,
                    chi2_p_value=chi2_p,
                    chi2_dof=dof,
                    n=len(shifted),
                )
            )
        except Exception:  # a family that cannot fit this data is simply skipped
            continue

    return sorted(results, key=lambda fit: fit.aic)


def fit_discrete(values: pd.Series) -> pd.DataFrame:
    """Binomial, Poisson and Geometric against a count response.

    The chi-square here compares observed frequencies against expected ones under
    each fitted family, which is the discrete goodness of fit the syllabus names.
    """
    data = values.dropna().astype(int).to_numpy()
    data = data[data >= 0]
    if len(data) < 20:
        return pd.DataFrame()

    n = len(data)
    mean = float(np.mean(data))
    variance = float(np.var(data, ddof=1))
    top = int(data.max())
    observed = np.bincount(data, minlength=top + 1)

    rows = []

    def score(name: str, pmf: np.ndarray, estimated: int) -> None:
        expected = pmf * n
        keep = expected >= 5
        if keep.sum() < 3:
            return
        statistic = float(
            ((observed[: len(expected)][keep] - expected[keep]) ** 2 / expected[keep]).sum()
        )
        dof = int(keep.sum() - 1 - estimated)
        rows.append(
            {
                "family": name,
                "chi2": statistic,
                "dof": dof,
                "p_value": float(1 - sp.chi2.cdf(statistic, dof)) if dof > 0 else float("nan"),
                "rejected_at_5pc": (1 - sp.chi2.cdf(statistic, dof)) < 0.05 if dof > 0 else None,
            }
        )

    support = np.arange(top + 1)
    score("poisson", sp.poisson.pmf(support, mean), 1)

    # Binomial needs a trial count; use the observed maximum as n.
    if top > 0:
        score("binomial", sp.binom.pmf(support, top, mean / top), 1)

    if mean > 0:
        score("geometric", sp.geom.pmf(support + 1, 1 / (1 + mean)), 1)

    table = pd.DataFrame(rows)
    if not table.empty:
        # Poisson assumes variance equals mean; reporting the ratio says whether
        # that assumption was ever plausible.
        table.attrs["mean"] = mean
        table.attrs["variance"] = variance
        table.attrs["dispersion"] = variance / mean if mean else float("nan")
    return table


def as_table(fits: list[Fit]) -> pd.DataFrame:
    return pd.DataFrame(
        [
            {
                "family": fit.family,
                "AIC": fit.aic,
                "BIC": fit.bic,
                "log_likelihood": fit.log_likelihood,
                "KS": fit.ks_statistic,
                "KS p": fit.ks_p_value,
                "chi2": fit.chi2_statistic,
                "chi2 p": fit.chi2_p_value,
                "GOF rejected": fit.rejected_at_5pc,
            }
            for fit in fits
        ]
    )


def best(fits: list[Fit]) -> Fit | None:
    return fits[0] if fits else None
