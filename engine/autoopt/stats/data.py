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

METHOD_ORDER = [
    "fixed_pipeline",
    "greedy",
    "random_baseline",
    "simulated_annealing",
    "hill_climbing",
    "astar",
]

SIZE_LABELS = ["small", "medium", "large", "xlarge"]


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
        return [m for m in METHOD_ORDER if m in set(self.frame["method"])]

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

    frame["plateau"] = frame["method"].isin(PLATEAU_CROSSING)
    frame["instructions_removed"] = frame["instructions_before"] - frame["instructions_after"]
    frame["productive"] = (frame["accepted"] / frame["iterations"].replace(0, pd.NA)).fillna(0.0)
    frame["category"] = pd.Categorical(
        frame["category"], categories=[c for c in CATEGORY_ORDER if c in set(frame["category"])]
    )

    return Dataset(frame=frame, source=source)


def latin_square_sample(
    dataset: Dataset,
    budget: int,
    methods: tuple[str, ...],
    categories: tuple[str, ...],
    seed: int = 0,
) -> pd.DataFrame:
    """A 4x4 Latin Square: rows are size strata, columns categories, treatments methods.

    Each treatment appears exactly once per row and once per column, which is
    what makes it a Latin Square rather than a factorial slice. Cells are drawn
    from the real data by matching on (size stratum, category, method); a cell
    with no matching run is dropped and reported rather than imputed.
    """
    frame = dataset.at_budget(budget)
    rows = SIZE_LABELS[: len(methods)]
    grid: list[dict[str, object]] = []

    for row_index, stratum in enumerate(rows):
        for column_index, category in enumerate(categories):
            # The standard cyclic Latin Square assignment.
            method = methods[(row_index + column_index) % len(methods)]
            matches = frame[
                (frame["size_stratum"] == stratum)
                & (frame["category"] == category)
                & (frame["method"] == method)
            ]
            if matches.empty:
                continue
            grid.append(
                {
                    "size_stratum": stratum,
                    "category": category,
                    "method": method,
                    "cost_reduction": float(
                        matches["cost_reduction"].sample(1, random_state=seed).iloc[0]
                    ),
                }
            )

    return pd.DataFrame(grid)
