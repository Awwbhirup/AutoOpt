"""Loading run data and deriving the columns the analysis needs.

One place that knows the shape of the master CSV, so every statistical module
takes a DataFrame and never a file path.

Derived columns:

    size_stratum   quartile of original instruction count, the blocking factor
                   for the three-way ANOVA and the rows of the Latin Square
    plateau        whether the method can cross a cost-neutral state, which the
                   unconstrained run showed to be the real treatment
    verified       proposals that survived verification
    productive     accepted / iterations, the availability analogue
"""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path

import pandas as pd

#: Methods that may pass through a state that does not lower cost.
PLATEAU_CROSSING = frozenset({"astar", "hill_climbing", "simulated_annealing"})

CATEGORY_ORDER = [
    "arithmetic",
    "nested",
    "repeated",
    "dead_code",
    "loops",
    "conditional",
    "mixed",
]

#: Presentation order only, roughly ascending by mean cost reduction so a plot
#: reads left to right. Every method the engine can run must appear here, or
#: lookups against it drop it silently; tests/test_stats.py enforces that.
METHOD_ORDER = [
    "llm",
    "fixed_pipeline",
    "greedy",
    "random_baseline",
    "simulated_annealing",
    "hill_climbing",
    "astar",
]

SIZE_LABELS = ["small", "medium", "large", "xlarge"]


def order_methods(values: pd.Series) -> list[str]:
    """Methods present, in presentation order, losing none of them.

    Anything not in METHOD_ORDER goes on the end in sorted order rather than
    being dropped. Filtering against a hardcoded list is how a newly added method
    disappears from every plot without an error being raised anywhere.
    """
    present = set(values.astype(str))
    known = [method for method in METHOD_ORDER if method in present]
    return known + sorted(present - set(METHOD_ORDER))


@dataclass(frozen=True, slots=True)
class Dataset:
    """A loaded run, plus what the analysis needs to know about it."""

    frame: pd.DataFrame
    source: Path

    @property
    def n(self) -> int:
        return len(self.frame)

    @property
    def budgets(self) -> list[int]:
        return sorted(self.frame["node_budget"].unique())

    @property
    def methods(self) -> list[str]:
        return order_methods(self.frame["method"])

    def at_budget(self, budget: int) -> pd.DataFrame:
        return self.frame[self.frame["node_budget"] == budget]

    def describe(self) -> str:
        return (
            f"{self.n:,} runs, {self.frame['program_id'].nunique():,} programs, "
            f"{len(self.methods)} methods, budgets {self.budgets}"
        )


def load(path: str | Path) -> Dataset:
    """Read a master CSV and add the derived columns."""
    source = Path(path)
    frame = pd.read_csv(source)

    # Failed cells carry no measurements and would poison every mean.
    frame = frame[frame["error"].isna() | (frame["error"] == "")].copy()

    numeric = [
        "instructions_before",
        "instructions_after",
        "arithmetic_before",
        "arithmetic_after",
        "temps_before",
        "temps_after",
        "exec_before",
        "exec_after",
        "cost_before",
        "cost_after",
        "cost_reduction",
        "iterations",
        "proposals",
        "verified",
        "refuted",
        "cost_improving",
        "accepted",
        "stale",
        "nodes_expanded",
        "output_match",
        "wall_ms",
    ]
    for column in numeric:
        if column in frame:
            frame[column] = pd.to_numeric(frame[column], errors="coerce")

    if "node_budget" not in frame:
        frame["node_budget"] = 0
    frame["node_budget"] = (
        pd.to_numeric(frame["node_budget"], errors="coerce").fillna(0).astype(int)
    )

    # Quartiles of program size. Blocking on this separates "this method is
    # better" from "this method happened to get the bigger programs".
    frame["size_stratum"] = pd.qcut(
        frame["instructions_before"], q=4, labels=SIZE_LABELS, duplicates="drop"
    )

    # Absolute size is almost perfectly confounded with category in this corpus:
    # dead-code programs are always short, mixed ones always long, so knowing the
    # category tells you the stratum. A design crossing the two therefore has
    # empty cells, and their interaction is not identifiable.
    #
    # Relative size ranks each program against others in its own category, which
    # is orthogonal to category by construction. Absolute size is kept as well,
    # because the confound itself is worth reporting.
    #
    # Assigned per program, not per row. A program's size is the same in every
    # run of it, so ranking rows would scatter one program across several strata
    # depending on which duplicate row broke the tie, and no (category, stratum,
    # method) cell would then be reliably populated.
    programs = (
        frame[["program_id", "category", "instructions_before"]]
        .drop_duplicates("program_id")
        .copy()
    )
    programs["relative_size"] = (
        programs.groupby("category", observed=True)["instructions_before"]
        .transform(lambda s: pd.qcut(s.rank(method="first"), q=4, labels=SIZE_LABELS))
        .astype("object")
    )
    frame = frame.merge(programs[["program_id", "relative_size"]], on="program_id", how="left")

    frame["plateau"] = frame["method"].isin(PLATEAU_CROSSING)
    frame["instructions_removed"] = frame["instructions_before"] - frame["instructions_after"]
    frame["productive"] = (frame["accepted"] / frame["iterations"].replace(0, pd.NA)).fillna(0.0)
    frame["category"] = pd.Categorical(
        frame["category"], categories=[c for c in CATEGORY_ORDER if c in set(frame["category"])]
    )

    return Dataset(frame=frame, source=source)


def confounding_table(dataset: Dataset, budget: int) -> pd.DataFrame:
    """How far category and absolute size overlap.

    A near-diagonal table means the two cannot be separated, which is a real
    limitation of the corpus rather than of the analysis, and is reported as one.
    """
    frame = dataset.at_budget(budget)
    return pd.crosstab(frame["size_stratum"], frame["category"]).reset_index()


def latin_square_sample(
    dataset: Dataset,
    budget: int,
    methods: tuple[str, ...],
    categories: tuple[str, ...],
    seed: int = 0,
    row_factor: str = "relative_size",
    replicates: int = 8,
) -> pd.DataFrame:
    """A 4x4 Latin Square: rows are size strata, columns categories, treatments methods.

    Each treatment appears exactly once per row and once per column, which is
    what makes it a Latin Square rather than a factorial slice. Cells are drawn
    from the real data by matching on (relative size, category, method); a cell
    with no matching run is dropped and reported rather than imputed.

    Replicated on purpose. A bare 4x4 gives sixteen observations and six residual
    degrees of freedom, which cannot detect a treatment effect of the size seen
    here; drawing several runs per cell keeps the Latin Square structure and
    gives the F test enough power to say anything.
    """
    frame = dataset.at_budget(budget)
    rows = SIZE_LABELS[: len(methods)]
    grid: list[dict[str, object]] = []

    for row_index, stratum in enumerate(rows):
        for column_index, category in enumerate(categories):
            # The standard cyclic Latin Square assignment: each treatment appears
            # exactly once in every row and every column.
            method = methods[(row_index + column_index) % len(methods)]
            matches = frame[
                (frame[row_factor] == stratum)
                & (frame["category"] == category)
                & (frame["method"] == method)
            ]
            if matches.empty:
                continue
            drawn = matches["cost_reduction"].sample(
                min(replicates, len(matches)), random_state=seed
            )
            for value in drawn:
                grid.append(
                    {
                        "relative_size": stratum,
                        "category": category,
                        "method": method,
                        "cost_reduction": float(value),
                    }
                )

    return pd.DataFrame(grid)
