"""Module 3: correlation and regression.

Three things.

Correlation, in all the forms the syllabus names: Pearson, Spearman rank, and
partial correlation. Partial matters here for a concrete reason: program size
correlates with almost everything, so a raw correlation between "transformations
accepted" and "cost reduction" is partly just both being larger on larger
programs. Partialling size out says how much is left.

Multiple regression of cost reduction on program features, which answers whether
the outcome is predictable from the shape of the program before any optimization
runs.

The cost model weights, fitted rather than assumed. Project 5 names four cost
terms and gives no weights; the bootstrap used Project 3's. Regressing measured
interpreter steps on the four terms gives coefficients that say what the terms
are actually worth, which is a better answer to "where did your weights come
from" than a citation.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any

import numpy as np
import pandas as pd
import statsmodels.api as sm
import statsmodels.formula.api as smf
from scipy import stats as sp

#: Features known before any optimization runs, so a model over them predicts
#: rather than merely describes.
PREDICTORS = [
    "instructions_before",
    "arithmetic_before",
    "temps_before",
    "exec_before",
]


@dataclass(frozen=True, slots=True)
class Correlation:
    x: str
    y: str
    pearson: float
    pearson_p: float
    spearman: float
    spearman_p: float
    n: int

    @property
    def strength(self) -> str:
        r = abs(self.pearson)
        if r < 0.2:
            return "negligible"
        if r < 0.4:
            return "weak"
        if r < 0.6:
            return "moderate"
        if r < 0.8:
            return "strong"
        return "very strong"


def correlate(frame: pd.DataFrame, x: str, y: str) -> Correlation:
    subset = frame[[x, y]].dropna()
    pearson, pearson_p = sp.pearsonr(subset[x], subset[y])
    spearman, spearman_p = sp.spearmanr(subset[x], subset[y])
    return Correlation(
        x=x,
        y=y,
        pearson=float(pearson),
        pearson_p=float(pearson_p),
        spearman=float(spearman),
        spearman_p=float(spearman_p),
        n=len(subset),
    )


def correlation_matrix(
    frame: pd.DataFrame, columns: list[str], method: str = "pearson"
) -> pd.DataFrame:
    return frame[columns].corr(method=method)


def partial_correlation(frame: pd.DataFrame, x: str, y: str, control: str) -> dict[str, float]:
    """Correlation between x and y with `control` held constant.

    Computed the textbook way, from the three pairwise correlations, so the
    formula is visible rather than hidden in a library call.
    """
    subset = frame[[x, y, control]].dropna()
    r_xy = float(sp.pearsonr(subset[x], subset[y])[0])
    r_xz = float(sp.pearsonr(subset[x], subset[control])[0])
    r_yz = float(sp.pearsonr(subset[y], subset[control])[0])

    denominator = np.sqrt((1 - r_xz**2) * (1 - r_yz**2))
    partial = (r_xy - r_xz * r_yz) / denominator if denominator else float("nan")

    n = len(subset)
    # t test on the partial, losing one degree of freedom for the control.
    dof = n - 3
    t = partial * np.sqrt(dof / (1 - partial**2)) if abs(partial) < 1 and dof > 0 else float("nan")
    p_value = float(2 * (1 - sp.t.cdf(abs(t), dof))) if dof > 0 and np.isfinite(t) else float("nan")

    return {
        "r_xy": r_xy,
        "r_xz": r_xz,
        "r_yz": r_yz,
        "partial": float(partial),
        "n": n,
        "t": float(t),
        "p_value": p_value,
    }


@dataclass(frozen=True, slots=True)
class RegressionResult:
    formula: str
    r_squared: float
    adjusted_r_squared: float
    f_statistic: float
    f_p_value: float
    n: int
    coefficients: pd.DataFrame
    vif: pd.DataFrame
    breusch_pagan_p: float
    durbin_watson: float

    @property
    def multicollinear(self) -> bool:
        """VIF above 10 is the conventional line for a predictor being redundant."""
        return bool((self.vif["VIF"] > 10).any())

    @property
    def heteroscedastic(self) -> bool:
        return self.breusch_pagan_p < 0.05


def _diagnostics(
    model: Any, frame: pd.DataFrame, predictors: list[str]
) -> tuple[pd.DataFrame, float, float]:
    from statsmodels.stats.diagnostic import het_breuschpagan
    from statsmodels.stats.outliers_influence import variance_inflation_factor
    from statsmodels.stats.stattools import durbin_watson

    design = sm.add_constant(frame[predictors].astype(float))
    vif = pd.DataFrame(
        {
            "predictor": design.columns,
            "VIF": [variance_inflation_factor(design.values, i) for i in range(design.shape[1])],
        }
    )
    _, bp_p, _, _ = het_breuschpagan(model.resid, model.model.exog)
    return vif, float(bp_p), float(durbin_watson(model.resid))


def multiple_regression(
    frame: pd.DataFrame,
    response: str = "cost_reduction",
    predictors: list[str] | None = None,
    with_category: bool = True,
) -> RegressionResult:
    """Regress a response on program features, optionally with category dummies."""
    predictors = predictors or PREDICTORS
    columns = [response, *predictors] + (["category"] if with_category else [])
    subset = frame[columns].dropna().copy()

    terms = " + ".join(predictors) + (" + C(category)" if with_category else "")
    formula = f"{response} ~ {terms}"
    model = smf.ols(formula, data=subset).fit()

    coefficients = pd.DataFrame(
        {
            "term": model.params.index,
            "coefficient": model.params.to_numpy(),
            "std_error": model.bse.to_numpy(),
            "t": model.tvalues.to_numpy(),
            "p_value": model.pvalues.to_numpy(),
        }
    )
    vif, bp_p, dw = _diagnostics(model, subset, predictors)

    return RegressionResult(
        formula=formula,
        r_squared=float(model.rsquared),
        adjusted_r_squared=float(model.rsquared_adj),
        f_statistic=float(model.fvalue),
        f_p_value=float(model.f_pvalue),
        n=int(model.nobs),
        coefficients=coefficients,
        vif=vif,
        breusch_pagan_p=bp_p,
        durbin_watson=dw,
    )


def fit_cost_weights(frame: pd.DataFrame) -> dict[str, object]:
    """Fit the cost model's four weights from data instead of assuming them.

    Regresses the measured execution estimate on the four raw terms, standardised
    so the coefficients are comparable, then normalises them to sum to one. The
    result is directly usable as CostWeights, and it answers "where did these
    numbers come from" with a fitted model rather than a citation.
    """
    terms = ["instructions_before", "arithmetic_before", "temps_before", "exec_before"]
    subset = frame[[*terms, "wall_ms"]].dropna().astype(float)

    standardised = (subset[terms] - subset[terms].mean()) / subset[terms].std(ddof=1)
    standardised = standardised.fillna(0.0)
    target = subset["wall_ms"]

    model = sm.OLS(target, sm.add_constant(standardised)).fit()
    raw = model.params.drop("const").abs()
    normalised = raw / raw.sum() if raw.sum() else raw

    return {
        "r_squared": float(model.rsquared),
        "n": int(model.nobs),
        "standardised_coefficients": model.params.drop("const").to_dict(),
        "p_values": model.pvalues.drop("const").to_dict(),
        "fitted_weights": {
            "instructions": float(normalised.get("instructions_before", 0.0)),
            "arithmetic": float(normalised.get("arithmetic_before", 0.0)),
            "temporaries": float(normalised.get("temps_before", 0.0)),
            "execution": float(normalised.get("exec_before", 0.0)),
        },
        "handout_weights": {
            "instructions": 0.4,
            "arithmetic": 0.3,
            "temporaries": 0.2,
            "execution": 0.1,
        },
    }
