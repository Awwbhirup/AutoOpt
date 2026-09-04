"""Modules 5 and 6: hypothesis testing and design of experiments.

Module 5 is the machinery: hypotheses stated, error types named, critical region
identified, decision taken. Every test below reports the pieces rather than only
a p-value, because "reject at 0.05" without the critical value or the effect size
says very little.

Module 6 is the designs:

    CRD          one-way ANOVA on category
    RBD          two-way, method x category, category as block, with interaction
    three-way    method x category x size stratum
    LSD          4x4 Latin Square, rows size, columns category, treatments method

Assumptions come first. Shapiro-Wilk for normality, Levene for equal variance,
and a non-parametric backup reported alongside, so a violated assumption changes
the conclusion instead of being noted and ignored.
"""

from __future__ import annotations

from dataclasses import dataclass

import numpy as np
import pandas as pd
import statsmodels.api as sm
import statsmodels.formula.api as smf
from scipy import stats as sp
from statsmodels.stats.multicomp import pairwise_tukeyhsd

ALPHA = 0.05


@dataclass(frozen=True, slots=True)
class TestResult:
    """One hypothesis test, with everything Module 5 asks to be stated."""

    name: str
    null: str
    alternative: str
    statistic: float
    p_value: float
    critical_value: float
    dof: str
    alpha: float = ALPHA
    effect_size: float | None = None
    effect_name: str = ""
    note: str = ""

    @property
    def reject(self) -> bool:
        return self.p_value < self.alpha

    @property
    def decision(self) -> str:
        return (
            f"reject H0 at alpha={self.alpha}"
            if self.reject
            else f"fail to reject H0 at alpha={self.alpha}"
        )

    @property
    def type_of_error_at_risk(self) -> str:
        """Which error the decision exposes you to, which is the Module 5 point."""
        return "Type I (false positive)" if self.reject else "Type II (false negative)"


def _cohens_d(a: np.ndarray, b: np.ndarray) -> float:
    na, nb = len(a), len(b)
    pooled = np.sqrt(((na - 1) * np.var(a, ddof=1) + (nb - 1) * np.var(b, ddof=1)) / (na + nb - 2))
    return float((np.mean(a) - np.mean(b)) / pooled) if pooled else 0.0


# --- Module 5: large and small sample tests ---------------------------------------


def z_test_proportion(successes: int, n: int, p0: float, label: str = "proportion") -> TestResult:
    """Large sample Z test for a single proportion.

    Used on verification pass rate and false positive rate, where n is in the
    tens of thousands and the normal approximation is comfortable.
    """
    p_hat = successes / n if n else 0.0
    se = np.sqrt(p0 * (1 - p0) / n) if n and 0 < p0 < 1 else 0.0
    z = (p_hat - p0) / se if se else float("inf") if p_hat != p0 else 0.0
    p_value = float(2 * (1 - sp.norm.cdf(abs(z)))) if np.isfinite(z) else 0.0
    return TestResult(
        name=f"Z test, {label}",
        null=f"p = {p0}",
        alternative=f"p != {p0}",
        statistic=float(z),
        p_value=p_value,
        critical_value=float(sp.norm.ppf(1 - ALPHA / 2)),
        dof="-",
        effect_size=float(p_hat - p0),
        effect_name="difference in proportion",
        note=f"observed p_hat = {p_hat:.4f} from {successes}/{n}",
    )


def t_test_two_sample(a: pd.Series, b: pd.Series, label_a: str, label_b: str) -> TestResult:
    """Welch's t test, which does not assume the two variances are equal."""
    x, y = a.dropna().to_numpy(float), b.dropna().to_numpy(float)
    statistic, p_value = sp.ttest_ind(x, y, equal_var=False)
    dof = len(x) + len(y) - 2
    return TestResult(
        name=f"Welch t test, {label_a} vs {label_b}",
        null=f"mean({label_a}) = mean({label_b})",
        alternative=f"mean({label_a}) != mean({label_b})",
        statistic=float(statistic),
        p_value=float(p_value),
        critical_value=float(sp.t.ppf(1 - ALPHA / 2, dof)),
        dof=f"~{dof}",
        effect_size=_cohens_d(x, y),
        effect_name="Cohen's d",
    )


def paired_t_test(
    frame: pd.DataFrame, method_a: str, method_b: str, response: str = "cost_reduction"
) -> TestResult:
    """Paired test on the same programs, which removes program to program variation.

    Pairing matters: the spread between programs is far larger than the spread
    between methods, so an unpaired test on the same data has much less power.
    """
    pivot = frame.pivot_table(index="program_id", columns="method", values=response)
    paired = pivot[[method_a, method_b]].dropna()
    statistic, p_value = sp.ttest_rel(paired[method_a], paired[method_b])
    differences = (paired[method_a] - paired[method_b]).to_numpy()
    dof = len(paired) - 1
    return TestResult(
        name=f"paired t test, {method_a} vs {method_b}",
        null="mean difference = 0",
        alternative="mean difference != 0",
        statistic=float(statistic),
        p_value=float(p_value),
        critical_value=float(sp.t.ppf(1 - ALPHA / 2, dof)),
        dof=str(dof),
        effect_size=float(np.mean(differences) / np.std(differences, ddof=1))
        if np.std(differences, ddof=1)
        else 0.0,
        effect_name="Cohen's d (paired)",
        note=f"{len(paired)} paired programs",
    )


def f_test_variances(a: pd.Series, b: pd.Series, label_a: str, label_b: str) -> TestResult:
    """F test for equality of two variances."""
    x, y = a.dropna().to_numpy(float), b.dropna().to_numpy(float)
    var_x, var_y = np.var(x, ddof=1), np.var(y, ddof=1)
    statistic = var_x / var_y if var_y else float("inf")
    dof_x, dof_y = len(x) - 1, len(y) - 1
    p_value = float(
        2 * min(sp.f.cdf(statistic, dof_x, dof_y), 1 - sp.f.cdf(statistic, dof_x, dof_y))
    )
    return TestResult(
        name=f"F test of variances, {label_a} vs {label_b}",
        null=f"var({label_a}) = var({label_b})",
        alternative=f"var({label_a}) != var({label_b})",
        statistic=float(statistic),
        p_value=p_value,
        critical_value=float(sp.f.ppf(1 - ALPHA / 2, dof_x, dof_y)),
        dof=f"{dof_x}, {dof_y}",
    )


def wilcoxon_backup(
    frame: pd.DataFrame, method_a: str, method_b: str, response: str = "cost_reduction"
) -> TestResult:
    """Non-parametric paired test, reported alongside the t test.

    If the responses are skewed, this is the one to trust, and having both means
    the choice is visible rather than made silently.
    """
    pivot = frame.pivot_table(index="program_id", columns="method", values=response)
    paired = pivot[[method_a, method_b]].dropna()
    statistic, p_value = sp.wilcoxon(paired[method_a], paired[method_b])
    return TestResult(
        name=f"Wilcoxon signed rank, {method_a} vs {method_b}",
        null="the paired differences are symmetric about zero",
        alternative="they are not",
        statistic=float(statistic),
        p_value=float(p_value),
        critical_value=float("nan"),
        dof=str(len(paired)),
        note="non-parametric backup for the paired t test",
    )


def chi_square_gof(observed: pd.Series, label: str = "applied mix") -> TestResult:
    """Chi-square goodness of fit against a uniform expectation."""
    counts = observed.to_numpy(float)
    expected = np.full(len(counts), counts.sum() / len(counts))
    statistic, p_value = sp.chisquare(counts, expected)
    dof = len(counts) - 1
    return TestResult(
        name=f"chi-square goodness of fit, {label}",
        null="all categories are equally likely",
        alternative="they are not",
        statistic=float(statistic),
        p_value=float(p_value),
        critical_value=float(sp.chi2.ppf(1 - ALPHA, dof)),
        dof=str(dof),
    )


def chi_square_independence(frame: pd.DataFrame, rows: str, columns: str) -> TestResult:
    """Chi-square test of independence of attributes."""
    table = pd.crosstab(frame[rows], frame[columns])
    statistic, p_value, dof, _ = sp.chi2_contingency(table)
    n = table.to_numpy().sum()
    minimum = min(table.shape) - 1
    return TestResult(
        name=f"chi-square independence, {rows} x {columns}",
        null=f"{rows} and {columns} are independent",
        alternative="they are associated",
        statistic=float(statistic),
        p_value=float(p_value),
        critical_value=float(sp.chi2.ppf(1 - ALPHA, dof)),
        dof=str(dof),
        effect_size=float(np.sqrt(statistic / (n * minimum))) if minimum else None,
        effect_name="Cramer's V",
    )


# --- assumptions -------------------------------------------------------------------


def assumption_checks(
    frame: pd.DataFrame, group: str, response: str = "cost_reduction"
) -> pd.DataFrame:
    """Shapiro-Wilk per group and Levene across groups.

    Run before the ANOVA, not after. A significant Levene means the equal
    variance assumption fails and the F test is optimistic.
    """
    rows = []
    samples = []
    for level, subset in frame.groupby(group, observed=True):
        values = subset[response].dropna().to_numpy(float)
        if len(values) < 3:
            continue
        samples.append(values)
        # Shapiro is oversensitive on very large samples, so cap it and say so.
        sample = (
            values
            if len(values) <= 5000
            else np.random.default_rng(0).choice(values, 5000, replace=False)
        )
        statistic, p_value = sp.shapiro(sample)
        rows.append(
            {
                "group": str(level),
                "n": len(values),
                "shapiro_W": float(statistic),
                "shapiro_p": float(p_value),
                "normal_at_5pc": bool(p_value >= ALPHA),
            }
        )

    table = pd.DataFrame(rows)
    if len(samples) >= 2:
        levene_stat, levene_p = sp.levene(*samples)
        table.attrs["levene_statistic"] = float(levene_stat)
        table.attrs["levene_p"] = float(levene_p)
        table.attrs["equal_variance_at_5pc"] = bool(levene_p >= ALPHA)
    return table


# --- Module 6: the designs -----------------------------------------------------------


def _anova(frame: pd.DataFrame, formula: str) -> pd.DataFrame:
    model = smf.ols(formula, data=frame).fit()
    table = sm.stats.anova_lm(model, typ=2)
    # Partial eta squared: how much of the leftover variation each factor explains.
    residual = table.loc["Residual", "sum_sq"]
    table["partial_eta_sq"] = table["sum_sq"] / (table["sum_sq"] + residual)
    table.attrs["r_squared"] = float(model.rsquared)
    table.attrs["formula"] = formula
    return table


def crd_one_way(
    frame: pd.DataFrame, factor: str = "category", response: str = "cost_reduction"
) -> pd.DataFrame:
    """Completely Randomised Design: one-way ANOVA."""
    return _anova(frame, f"{response} ~ C({factor})")


def rbd_two_way(
    frame: pd.DataFrame,
    treatment: str = "method",
    block: str = "category",
    response: str = "cost_reduction",
    interaction: bool = True,
) -> pd.DataFrame:
    """Randomised Block Design: treatment and block, optionally with interaction.

    The block absorbs variation that is real but not of interest. Program
    category strongly affects how much can be optimized, and blocking on it means
    the method comparison is not swamped by that.
    """
    term = "*" if interaction else "+"
    return _anova(frame, f"{response} ~ C({treatment}) {term} C({block})")


def three_way(frame: pd.DataFrame, response: str = "cost_reduction") -> pd.DataFrame:
    """Method x category x size stratum, with all interactions."""
    return _anova(frame, f"{response} ~ C(method) * C(category) * C(size_stratum)")


def latin_square(design: pd.DataFrame, response: str = "cost_reduction") -> pd.DataFrame:
    """Latin Square: treatment effect with both nuisance factors removed.

    Rows and columns each control one source of variation, so the treatment is
    compared having accounted for both, using far fewer runs than a full
    factorial would need.
    """
    return _anova(design, f"{response} ~ C(method) + C(size_stratum) + C(category)")


def tukey(
    frame: pd.DataFrame, group: str = "method", response: str = "cost_reduction"
) -> pd.DataFrame:
    """Tukey HSD: which pairs actually differ, controlling the family-wise error.

    A significant ANOVA says some group differs. This says which, without the
    inflated error rate that running every pairwise t test would give.
    """
    subset = frame[[group, response]].dropna()
    result = pairwise_tukeyhsd(subset[response], subset[group], alpha=ALPHA)
    table = pd.DataFrame(result.summary().data[1:], columns=result.summary().data[0])
    return table


def homogeneous_subsets(
    tukey_table: pd.DataFrame,
    frame: pd.DataFrame,
    group: str = "method",
    response: str = "cost_reduction",
) -> list[list[str]]:
    """Group levels that Tukey could not separate.

    Reported because the count of subsets is the honest summary of a treatment
    factor: six levels forming two subsets is a two-level factor in disguise.
    """
    means = frame.groupby(group, observed=True)[response].mean().sort_values(ascending=False)
    order = list(means.index)

    differs: set[frozenset[str]] = set()
    for _, row in tukey_table.iterrows():
        if bool(row["reject"]):
            differs.add(frozenset({str(row["group1"]), str(row["group2"])}))

    subsets: list[list[str]] = []
    for level in order:
        placed = False
        for subset in subsets:
            if all(frozenset({level, member}) not in differs for member in subset):
                subset.append(level)
                placed = True
                break
        if not placed:
            subsets.append([level])
    return subsets


def power_analysis(
    effect_size: float = 0.25, alpha: float = ALPHA, power: float = 0.80, groups: int = 6
) -> dict[str, float]:
    """Sample size needed to detect a medium effect.

    Justifies the corpus size rather than leaving 500 as a round number.
    """
    from statsmodels.stats.power import FTestAnovaPower

    required = FTestAnovaPower().solve_power(
        effect_size=effect_size, alpha=alpha, power=power, k_groups=groups
    )
    return {
        "effect_size_f": effect_size,
        "alpha": alpha,
        "target_power": power,
        "groups": groups,
        "required_total_n": float(required),
        "required_per_group": float(required / groups),
    }
