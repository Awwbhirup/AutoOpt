"""Runs every analysis in order and collects the results.

One entry point so the notebook, the CLI and the report all produce identical
numbers from identical code. Each section maps to a syllabus module and is
reported with the module number, so the write-up can cite where each result
comes from.

Nothing here interprets. It computes and returns; the prose is written by hand
against these tables, which is the right way round.
"""

from __future__ import annotations

import json
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

import pandas as pd

from . import descriptive, distributions, randomvars, regression, reliability, testing
from .data import Dataset, confounding_table, latin_square_sample

#: Latin Square needs a square design: four treatments, four rows, four columns.
LSD_METHODS = ("greedy", "simulated_annealing", "hill_climbing", "astar")
LSD_CATEGORIES = ("arithmetic", "repeated", "loops", "mixed")


@dataclass
class Section:
    module: str
    title: str
    tables: dict[str, pd.DataFrame] = field(default_factory=dict)
    values: dict[str, Any] = field(default_factory=dict)
    notes: list[str] = field(default_factory=list)


@dataclass
class Analysis:
    dataset: Dataset
    budget: int
    sections: list[Section] = field(default_factory=list)

    def section(self, module: str) -> Section:
        return next(s for s in self.sections if s.module == module)

    def to_json(self, path: Path) -> None:
        """Scalar results only. Tables go to CSV alongside."""
        payload = {
            "source": str(self.dataset.source),
            "budget": self.budget,
            "n": self.dataset.n,
            "sections": [
                {
                    "module": s.module,
                    "title": s.title,
                    "values": _jsonable(s.values),
                    "notes": s.notes,
                }
                for s in self.sections
            ],
        }
        path.write_text(json.dumps(payload, indent=2, default=str), encoding="utf-8")

    def write_tables(self, directory: Path) -> list[Path]:
        directory.mkdir(parents=True, exist_ok=True)
        written = []
        for s in self.sections:
            for name, table in s.tables.items():
                path = directory / f"{s.module}_{name}.csv"
                table.to_csv(path, index=False)
                written.append(path)
        return written


def _jsonable(values: dict[str, Any]) -> dict[str, Any]:
    out: dict[str, Any] = {}
    for key, value in values.items():
        if isinstance(value, testing.TestResult):
            out[key] = {
                "name": value.name,
                "null": value.null,
                "alternative": value.alternative,
                "statistic": value.statistic,
                "p_value": value.p_value,
                "critical_value": value.critical_value,
                "dof": value.dof,
                "decision": value.decision,
                "reject": value.reject,
                "effect_size": value.effect_size,
                "effect_name": value.effect_name,
                "error_at_risk": value.type_of_error_at_risk,
                "note": value.note,
            }
        elif isinstance(value, dict | list | str | int | float | bool | type(None)):
            out[key] = value
        else:
            out[key] = str(value)
    return out


def run(dataset: Dataset, budget: int | None = None) -> Analysis:
    """Every module, in syllabus order."""
    budget = dataset.budgets[0] if budget is None else budget
    frame = dataset.at_budget(budget)
    analysis = Analysis(dataset=dataset, budget=budget)

    analysis.sections.append(_module_1(frame))
    analysis.sections.append(_module_2(frame))
    analysis.sections.append(_module_3(frame))
    analysis.sections.append(_module_4(frame))
    analysis.sections.append(_module_5(frame))
    analysis.sections.append(_module_6(dataset, frame, budget))
    analysis.sections.append(_module_7(frame))
    return analysis


def _module_1(frame: pd.DataFrame) -> Section:
    section = Section("M1", "Descriptive statistics")
    summaries = descriptive.overall(frame)
    section.tables["overall"] = descriptive.as_table(summaries)
    section.tables["by_method"] = descriptive.by_group(frame, "method")
    section.tables["by_category"] = descriptive.by_group(frame, "category")
    section.tables["by_size"] = descriptive.by_group(frame, "size_stratum")

    skewed = [s.name for s in summaries if abs(s.skewness) > 1]
    section.values["strongly_skewed_responses"] = skewed
    section.notes.append(
        "Responses are right skewed, so the mean overstates the typical program "
        "and the ANOVA normality assumption needs checking rather than assuming."
    )
    return section


def _module_2(frame: pd.DataFrame) -> Section:
    section = Section("M2", "Random variables and joint distributions")
    joint = randomvars.joint_table(frame)

    section.tables["joint_VC"] = joint.joint.reset_index(names="V")
    section.tables["expectation_variance"] = joint.expectation_variance()
    section.tables["conditional_by_method"] = randomvars.conditional_by_group(frame, "method")
    section.tables["moments_cost_reduction"] = randomvars.moments(frame["cost_reduction"])
    section.tables["mgf_cost_reduction"] = randomvars.mgf(frame["cost_reduction"])

    section.values["P(V=1)_verification_pass_rate"] = joint.p_verified
    section.values["P(C=1|V=1)_acceptance_rate"] = joint.p_cheaper_given_verified
    section.values["P(V=1,C=1)_acceptance"] = joint.p_accept
    section.values["binomial_check"] = randomvars.bernoulli_fit_check(frame)
    section.notes.append(
        "Two of the six mandated compiler metrics are a marginal and a conditional "
        "of this joint distribution, not separately defined quantities."
    )
    return section


def _module_3(frame: pd.DataFrame) -> Section:
    section = Section("M3", "Correlation and regression")
    columns = [
        "cost_reduction",
        "accepted",
        "instructions_before",
        "arithmetic_before",
        "temps_before",
        "nodes_expanded",
    ]
    section.tables["pearson"] = frame[columns].corr().reset_index(names="variable")
    section.tables["spearman"] = (
        frame[columns].corr(method="spearman").reset_index(names="variable")
    )

    pairs = [
        ("accepted", "cost_reduction"),
        ("instructions_before", "cost_reduction"),
        ("nodes_expanded", "cost_reduction"),
    ]
    section.tables["correlations"] = pd.DataFrame(
        [
            {
                "x": c.x,
                "y": c.y,
                "pearson": c.pearson,
                "p": c.pearson_p,
                "spearman": c.spearman,
                "strength": c.strength,
                "n": c.n,
            }
            for c in (regression.correlate(frame, x, y) for x, y in pairs)
        ]
    )

    # Size drives both how much work there is and how much can be saved, so the
    # raw correlation between them is partly just size showing up twice.
    section.values["partial_accepted_vs_reduction_controlling_size"] = (
        regression.partial_correlation(frame, "accepted", "cost_reduction", "instructions_before")
    )

    model = regression.multiple_regression(frame)
    section.tables["regression_coefficients"] = model.coefficients
    section.tables["vif"] = model.vif
    section.values["regression"] = {
        "formula": model.formula,
        "r_squared": model.r_squared,
        "adjusted_r_squared": model.adjusted_r_squared,
        "f": model.f_statistic,
        "f_p": model.f_p_value,
        "n": model.n,
        "multicollinear": model.multicollinear,
        "heteroscedastic": model.heteroscedastic,
        "breusch_pagan_p": model.breusch_pagan_p,
        "durbin_watson": model.durbin_watson,
    }
    section.values["fitted_cost_weights"] = regression.fit_cost_weights(frame)
    section.notes.append(
        "The cost model's weights are fitted here rather than assumed, which "
        "answers where they came from with a model instead of a citation."
    )
    return section


def _module_4(frame: pd.DataFrame) -> Section:
    section = Section("M4", "Probability distributions and goodness of fit")

    for response in ("cost_reduction", "wall_ms"):
        if response not in frame:
            continue
        fits = distributions.fit_continuous(frame[response])
        if fits:
            section.tables[f"continuous_{response}"] = distributions.as_table(fits)
            best = distributions.best(fits)
            assert best is not None
            section.values[f"best_fit_{response}"] = {
                "family": best.family,
                "parameters": list(best.parameters),
                "aic": best.aic,
                "gof_rejected": best.rejected_at_5pc,
            }

    for response in ("accepted", "iterations"):
        table = distributions.fit_discrete(frame[response])
        if not table.empty:
            section.tables[f"discrete_{response}"] = table
            section.values[f"dispersion_{response}"] = {
                "mean": table.attrs.get("mean"),
                "variance": table.attrs.get("variance"),
                "ratio": table.attrs.get("dispersion"),
            }

    section.notes.append(
        "Normal is fitted alongside the skewed families on purpose, so the "
        "comparison shows whether assuming it would have been safe."
    )
    return section


def _module_5(frame: pd.DataFrame) -> Section:
    section = Section("M5", "Hypothesis testing I")

    proposals = int(frame["proposals"].sum())
    refuted = int(frame["refuted"].sum())
    runs = len(frame)
    mismatches = int((frame["output_match"] != 1).sum())

    section.values["z_verification_pass_rate"] = testing.z_test_proportion(
        proposals - refuted, proposals, 0.95, "verification pass rate vs 95%"
    )
    section.values["z_false_positive_rate"] = testing.z_test_proportion(
        mismatches, runs, 0.01, "false positive rate vs 1%"
    )
    section.values["z_cost_reduction_target"] = testing.z_test_proportion(
        int((frame["cost_reduction"] > 0.30).sum()),
        runs,
        0.5,
        "share of runs beating the 30% target vs 50%",
    )

    section.notes.append(
        "Each test states H0, H1, the critical value and which error the decision "
        "risks, rather than reporting a p-value alone."
    )
    return section


def _module_6(dataset: Dataset, frame: pd.DataFrame, budget: int) -> Section:
    section = Section("M6", "Hypothesis testing II and design of experiments")

    section.tables["assumptions_by_method"] = testing.assumption_checks(frame, "method")
    assumptions = section.tables["assumptions_by_method"]
    section.values["levene_p"] = assumptions.attrs.get("levene_p")
    section.values["equal_variance"] = assumptions.attrs.get("equal_variance_at_5pc")

    section.tables["crd_category"] = testing.crd_one_way(frame).reset_index(names="source")
    section.tables["rbd_method_category"] = testing.rbd_two_way(frame).reset_index(names="source")
    section.tables["three_way"] = testing.three_way(frame).reset_index(names="source")

    section.tables["confounding_size_category"] = confounding_table(dataset, budget)
    section.notes.append(
        "Absolute program size is confounded with category in this corpus, so the "
        "Latin Square blocks on size relative to other programs in the same "
        "category, which is orthogonal to it by construction."
    )

    design = latin_square_sample(dataset, budget, LSD_METHODS, LSD_CATEGORIES)
    section.tables["latin_square_design"] = design
    cells = (
        design.groupby(["relative_size", "category"], observed=True).ngroups if len(design) else 0
    )
    section.values["latin_square_cells"] = cells
    section.values["latin_square_observations"] = len(design)
    if cells >= len(LSD_METHODS) ** 2 - 2:
        section.tables["latin_square_anova"] = testing.latin_square(design).reset_index(
            names="source"
        )
    else:
        section.notes.append(
            f"Latin Square skipped: only {cells} of {len(LSD_METHODS) ** 2} cells had a run."
        )

    tukey_table = testing.tukey(frame, "method")
    section.tables["tukey_method"] = tukey_table
    subsets = testing.homogeneous_subsets(tukey_table, frame, "method")
    section.values["homogeneous_subsets"] = subsets
    section.values["distinct_method_groups"] = len(subsets)

    ranked = frame.groupby("method", observed=True)["cost_reduction"].mean().sort_values()
    worst, best = str(ranked.index[0]), str(ranked.index[-1])
    section.values["paired_t_best_vs_worst"] = testing.paired_t_test(frame, best, worst)
    section.values["wilcoxon_best_vs_worst"] = testing.wilcoxon_backup(frame, best, worst)
    section.values["f_test_variances"] = testing.f_test_variances(
        frame[frame["method"] == best]["cost_reduction"],
        frame[frame["method"] == worst]["cost_reduction"],
        best,
        worst,
    )

    applied = pd.Series(
        [k for row in frame["applied"].fillna("") for k in str(row).split("|") if k]
    ).value_counts()
    section.tables["applied_counts"] = applied.reset_index()
    section.values["chi2_gof_applied_mix"] = testing.chi_square_gof(applied, "applied mix")
    section.values["chi2_independence_category_plateau"] = testing.chi_square_independence(
        frame, "category", "plateau"
    )
    section.values["power_analysis"] = testing.power_analysis(groups=len(dataset.methods))

    if len(dataset.budgets) > 1:
        section.tables["method_x_budget"] = dataset.frame.pivot_table(
            index="method", columns="node_budget", values="cost_reduction", aggfunc="mean"
        ).reset_index()
        section.tables["rbd_method_budget"] = testing.rbd_two_way(
            dataset.frame, treatment="method", block="node_budget"
        ).reset_index(names="source")
        section.notes.append(
            "Budget is a factor as well, so the method x budget interaction says "
            "whether the ranking depends on how much search each method is allowed."
        )
    return section


def _module_7(frame: pd.DataFrame) -> Section:
    section = Section("M7", "Reliability")

    series = reliability.series_system(frame)
    parallel = reliability.channel_reliability(frame)

    section.values["series"] = {
        "R_verify": series.r_verify,
        "R_cost": series.r_cost,
        "R_system": series.reliability,
        "description": series.describe(),
    }
    section.values["parallel"] = {
        "R_channel_differential": parallel.r_channel_a,
        "R_channel_smt": parallel.r_channel_b,
        "R_detect": parallel.reliability,
        "description": parallel.describe(),
    }
    section.values["system"] = reliability.system_reliability(frame)
    section.values["maintainability"] = reliability.maintainability(frame)
    section.tables["hazard"] = reliability.hazard_by_iteration(frame)
    section.values["block_diagram"] = reliability.reliability_block_diagram()

    section.notes.append(
        "Acceptance requires two conditions at once, which is a series system; "
        "the two verification channels need only one to catch a fault, which is "
        "a parallel one. Neither is an analogy imposed on the data."
    )
    return section
