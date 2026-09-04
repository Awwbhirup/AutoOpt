"""Figures for the statistical analysis.

Separate from the six the compiler spec mandates. These exist to make the
statistics legible: the assumption checks that decide whether an ANOVA can be
trusted, the interaction that decides whether a main effect means anything, and
the fitted distribution laid over the data it claims to describe.

Each one earns its place by answering a question the tables cannot. A Q-Q plot
says *how* normality fails, not just that Shapiro rejected it. An interaction
plot shows whether lines cross, which is the difference between "method matters"
and "method matters differently per category".
"""

from __future__ import annotations

from collections.abc import Sequence

import matplotlib

matplotlib.use("Agg")
import numpy as np
import pandas as pd
from matplotlib import pyplot as plt
from matplotlib.figure import Figure
from scipy import stats as sp

from ..stats.data import METHOD_ORDER
from .plots import _finish
from .theme import Theme


def _ordered(frame: pd.DataFrame, column: str, order: Sequence[str]) -> list[str]:
    """Levels present, in the given order, with unknown ones kept on the end.

    Dropping a level the order does not mention would silently remove a whole
    method from a plot, which looks like a design decision rather than a bug.
    """
    present = set(frame[column].astype(str))
    known = [level for level in order if level in present]
    return known + sorted(present - set(order))


def method_boxplot(frame: pd.DataFrame, theme: Theme, response: str = "cost_reduction") -> Figure:
    """Distribution per method, not just the mean.

    Two methods can share a mean and behave completely differently, so the
    comparison the ANOVA makes should be visible as spread before it is tested.
    """
    methods = _ordered(frame, "method", METHOD_ORDER)
    data = [frame[frame["method"] == m][response].dropna().to_numpy() for m in methods]

    figure, axes = plt.subplots(figsize=(9, 4.6))
    parts = axes.boxplot(
        data,
        tick_labels=[m.replace("_", " ") for m in methods],
        patch_artist=True,
        medianprops={"color": theme.paper, "linewidth": 1.6},
        flierprops={
            "marker": ".",
            "markersize": 3,
            "markerfacecolor": theme.muted,
            "markeredgecolor": "none",
            "alpha": 0.4,
        },
    )
    for patch, colour in zip(parts["boxes"], theme.categorical, strict=False):
        patch.set_facecolor(colour)
        patch.set_alpha(0.85)
    for element in ("whiskers", "caps"):
        for line in parts[element]:
            line.set_color(theme.rule)

    axes.set_ylabel(response.replace("_", " "))
    axes.yaxis.set_major_formatter(lambda v, _: f"{v:.0%}")
    axes.tick_params(axis="x", rotation=20)
    axes.grid(axis="x", visible=False)

    return _finish(
        figure,
        theme,
        "Spread of results per method",
        "box is the interquartile range, line the median",
    )


def qq_plot(frame: pd.DataFrame, theme: Theme, response: str = "cost_reduction") -> Figure:
    """Whether the response is normal, and how it departs if not.

    ANOVA assumes normal residuals. Shapiro says yes or no; this says the answer
    is "right skewed", which is what justifies reporting the non-parametric
    backup alongside.
    """
    values = frame[response].dropna().to_numpy(float)
    figure, axes = plt.subplots(1, 2, figsize=(9.5, 4.2))

    (osm, osr), (slope, intercept, _) = sp.probplot(values, dist="norm")
    axes[0].scatter(osm, osr, s=6, alpha=0.35, color=theme.accent, linewidths=0)
    axes[0].plot(osm, slope * osm + intercept, color=theme.positive, linewidth=1.4)
    axes[0].set_xlabel("theoretical quantiles")
    axes[0].set_ylabel("observed")
    axes[0].set_title("Q-Q against normal", color=theme.muted, fontsize=10)

    axes[1].hist(values, bins=40, color=theme.accent, alpha=0.75)
    axes[1].axvline(float(np.mean(values)), color=theme.positive, linewidth=1.4, label="mean")
    axes[1].axvline(
        float(np.median(values)),
        color=theme.negative,
        linewidth=1.4,
        linestyle="--",
        label="median",
    )
    axes[1].set_xlabel(response.replace("_", " "))
    axes[1].set_ylabel("runs")
    axes[1].set_title("distribution", color=theme.muted, fontsize=10)
    axes[1].legend()

    skew = float(sp.skew(values, bias=False))
    return _finish(
        figure,
        theme,
        "Is the response normal",
        f"skewness {skew:.2f}; mean and median apart means the mean is not typical",
    )


def interaction_plot(frame: pd.DataFrame, theme: Theme, response: str = "cost_reduction") -> Figure:
    """Method against category. Crossing lines mean an interaction.

    Parallel lines say the method ranking holds everywhere, so the main effect
    can be read on its own. Crossing lines say it does not, and the main effect
    alone would be misleading.
    """
    methods = _ordered(frame, "method", METHOD_ORDER)
    means = frame.pivot_table(
        index="category", columns="method", values=response, aggfunc="mean", observed=True
    )

    figure, axes = plt.subplots(figsize=(9, 4.6))
    for index, method in enumerate(methods):
        if method not in means:
            continue
        axes.plot(
            range(len(means.index)),
            means[method],
            marker="o",
            markersize=4,
            color=theme.categorical[index % len(theme.categorical)],
            label=method.replace("_", " "),
        )

    axes.set_xticks(
        range(len(means.index)),
        [str(c).replace("_", " ") for c in means.index],
        rotation=20,
        ha="right",
    )
    axes.set_ylabel(f"mean {response.replace('_', ' ')}")
    axes.yaxis.set_major_formatter(lambda v, _: f"{v:.0%}")
    axes.legend(ncols=3, loc="upper left")
    axes.grid(axis="x", visible=False)

    return _finish(
        figure,
        theme,
        "Method against category",
        "parallel lines mean the ranking holds everywhere; crossing means it does not",
    )


def budget_interaction(
    frame: pd.DataFrame, theme: Theme, response: str = "cost_reduction"
) -> Figure:
    """How each method responds to being given more search budget.

    The result the budgeted run exists for: whether the ranking depends on how
    much search each method is allowed, or holds regardless.
    """
    methods = _ordered(frame, "method", METHOD_ORDER)
    means = frame.pivot_table(
        index="node_budget", columns="method", values=response, aggfunc="mean", observed=True
    )

    figure, axes = plt.subplots(figsize=(9, 4.6))
    for index, method in enumerate(methods):
        if method not in means:
            continue
        axes.plot(
            means.index,
            means[method],
            marker="o",
            markersize=5,
            color=theme.categorical[index % len(theme.categorical)],
            label=method.replace("_", " "),
        )

    axes.set_xlabel("node budget")
    axes.set_ylabel(f"mean {response.replace('_', ' ')}")
    axes.yaxis.set_major_formatter(lambda v, _: f"{v:.0%}")
    axes.set_xticks(list(means.index))
    axes.legend(ncols=2, loc="lower right")

    return _finish(
        figure,
        theme,
        "Does more search budget help",
        "separation at tight budgets is what makes method a real factor",
    )


def residual_diagnostics(frame: pd.DataFrame, theme: Theme) -> Figure:
    """Residuals against fitted, and their distribution.

    Structure in the left panel means the model is missing something; a widening
    fan means non-constant variance, which is what Breusch-Pagan tests.
    """
    import statsmodels.formula.api as smf

    columns = ["cost_reduction", "instructions_before", "arithmetic_before", "temps_before"]
    subset = frame[columns].dropna()
    model = smf.ols(
        "cost_reduction ~ instructions_before + arithmetic_before + temps_before", data=subset
    ).fit()

    figure, axes = plt.subplots(1, 2, figsize=(9.5, 4.2))
    axes[0].scatter(
        model.fittedvalues, model.resid, s=6, alpha=0.3, color=theme.accent, linewidths=0
    )
    axes[0].axhline(0, color=theme.rule, linewidth=1)
    axes[0].set_xlabel("fitted")
    axes[0].set_ylabel("residual")
    axes[0].set_title("residuals against fitted", color=theme.muted, fontsize=10)

    sp.probplot(model.resid, dist="norm", plot=None)
    (osm, osr), (slope, intercept, _) = sp.probplot(model.resid, dist="norm")
    axes[1].scatter(osm, osr, s=6, alpha=0.3, color=theme.accent, linewidths=0)
    axes[1].plot(osm, slope * osm + intercept, color=theme.positive, linewidth=1.4)
    axes[1].set_xlabel("theoretical quantiles")
    axes[1].set_ylabel("residual")
    axes[1].set_title("residual Q-Q", color=theme.muted, fontsize=10)

    return _finish(
        figure,
        theme,
        "Regression diagnostics",
        f"R^2 = {model.rsquared:.3f}; a widening fan on the left means unequal variance",
    )


def distribution_fit(frame: pd.DataFrame, theme: Theme, response: str = "cost_reduction") -> Figure:
    """The best fitting families drawn over the data they claim to describe."""
    from ..stats import distributions as dist

    values = frame[response].dropna().to_numpy(float)
    fits = dist.fit_continuous(frame[response])[:3]

    figure, axes = plt.subplots(figsize=(9, 4.6))
    axes.hist(values, bins=50, density=True, color=theme.neutral, alpha=0.5, label="observed")

    grid = np.linspace(max(values.min(), 1e-9), values.max(), 400)
    for index, fit in enumerate(fits):
        family = dist.CONTINUOUS_FAMILIES[fit.family]
        axes.plot(
            grid,
            family.pdf(grid, *fit.parameters),
            color=theme.categorical[index % len(theme.categorical)],
            linewidth=1.8,
            label=f"{fit.family}  AIC {fit.aic:.0f}",
        )

    axes.set_xlabel(response.replace("_", " "))
    axes.set_ylabel("density")
    axes.legend()

    return _finish(
        figure,
        theme,
        "Which distribution fits",
        "ranked by AIC, which charges a richer family for its extra parameter",
    )


def hazard_curve(hazard: pd.DataFrame, theme: Theme) -> Figure:
    """Hazard and survival across agent iterations."""
    figure, axes = plt.subplots(figsize=(9, 4.6))

    axes.bar(
        hazard["iteration"],
        hazard["hazard"],
        color=theme.accent,
        alpha=0.85,
        label="hazard: converges here, given it got here",
    )
    twin = axes.twinx()
    twin.plot(
        hazard["iteration"],
        hazard["survival"],
        color=theme.positive,
        marker="o",
        markersize=4,
        label="survival: still going",
    )
    twin.set_ylabel("survival", color=theme.muted)
    twin.tick_params(colors=theme.muted)
    twin.grid(visible=False)

    axes.set_xlabel("transformations accepted")
    axes.set_ylabel("hazard")
    handles = axes.get_legend_handles_labels()[0] + twin.get_legend_handles_labels()[0]
    labels = axes.get_legend_handles_labels()[1] + twin.get_legend_handles_labels()[1]
    axes.legend(handles, labels, loc="upper right")

    return _finish(
        figure,
        theme,
        "When runs stop finding improvements",
        "a rising hazard means opportunities run out rather than the search giving up",
    )


STATISTICAL_FIGURES = {
    "method_boxplot": method_boxplot,
    "qq_plot": qq_plot,
    "interaction_plot": interaction_plot,
    "budget_interaction": budget_interaction,
    "residual_diagnostics": residual_diagnostics,
    "distribution_fit": distribution_fit,
}
