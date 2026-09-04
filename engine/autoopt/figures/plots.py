"""The six figures the spec asks for, plus the metrics table.

All six are built from the master CSV alone, so they can be regenerated without
re-running the experiment, and every number in a report traces back to one file.

Each returns a matplotlib Figure rather than writing to disk, so the same code
serves the CLI, the report renderer and, later, the web dashboard.
"""

from __future__ import annotations

import json
from collections import Counter, defaultdict
from collections.abc import Sequence
from typing import Any

import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt
from matplotlib.figure import Figure
from matplotlib.patches import PathPatch, Rectangle
from matplotlib.path import Path as MplPath

from .theme import Theme

Rows = Sequence[dict[str, str]]

CATEGORY_ORDER = [
    "arithmetic",
    "nested",
    "repeated",
    "dead_code",
    "loops",
    "conditional",
    "mixed",
]

SHORT_KIND = {
    "constant_folding": "const fold",
    "constant_propagation": "const prop",
    "copy_propagation": "copy prop",
    "common_subexpression_elimination": "CSE",
    "dead_code_elimination": "dead code",
    "algebraic_simplification": "algebraic",
    "strength_reduction": "strength",
    "loop_invariant_code_motion": "LICM",
}


def _usable(rows: Rows, method: str | None = None) -> list[dict[str, str]]:
    selected = [row for row in rows if not row.get("error")]
    if method:
        selected = [row for row in selected if row["method"] == method]
    return selected


def _kind_totals(rows: Rows) -> dict[str, dict[str, int]]:
    totals: dict[str, dict[str, int]] = defaultdict(
        lambda: {"proposed": 0, "refuted": 0, "improving": 0, "accepted": 0}
    )
    for row in rows:
        raw = row.get("by_kind") or "{}"
        try:
            parsed = json.loads(raw)
        except json.JSONDecodeError:
            continue
        for kind, counts in parsed.items():
            for field, value in counts.items():
                totals[kind][field] += int(value)
    return dict(totals)


def _finish(figure: Figure, theme: Theme, title: str, subtitle: str = "") -> Figure:
    figure.suptitle(title, color=theme.ink, fontsize=13, fontweight=500, y=0.995, x=0.02, ha="left")
    if subtitle:
        figure.text(0.02, 0.905, subtitle, color=theme.muted, fontsize=9, ha="left")
    return figure


# --- 1. Sankey: proposals -> verified -> accepted --------------------------------


def _flow(
    axes: Any, x0: float, x1: float, y0: float, y1: float, h0: float, h1: float, colour: str
) -> None:
    """One smooth band between two stages."""
    middle = (x0 + x1) / 2
    vertices = [
        (x0, y0),
        (middle, y0),
        (middle, y1),
        (x1, y1),
        (x1, y1 + h1),
        (middle, y1 + h1),
        (middle, y0 + h0),
        (x0, y0 + h0),
        (x0, y0),
    ]
    codes = [
        MplPath.MOVETO,
        MplPath.CURVE4,
        MplPath.CURVE4,
        MplPath.CURVE4,
        MplPath.LINETO,
        MplPath.CURVE4,
        MplPath.CURVE4,
        MplPath.CURVE4,
        MplPath.CLOSEPOLY,
    ]
    axes.add_patch(
        PathPatch(MplPath(vertices, codes), facecolor=colour, edgecolor="none", alpha=0.16)
    )


def sankey_decisions(rows: Rows, theme: Theme) -> Figure:
    """Where proposals go: verified or refuted, then cheaper or not."""
    usable = _usable(rows)
    proposed = sum(int(row["proposals"]) for row in usable) or 1
    refuted = sum(int(row["refuted"]) for row in usable)
    verified = proposed - refuted
    improving = sum(int(row["cost_improving"]) for row in usable)
    no_gain = verified - improving

    figure, axes = plt.subplots(figsize=(9.5, 4.8))
    axes.set_xlim(0, 12)
    axes.set_ylim(-0.16, 1.12)
    axes.axis("off")

    top, bar_width = 0.94, 0.55

    def node(x: float, base: float, count: int, colour: str, label: str, align: str) -> float:
        height = top * count / proposed
        axes.add_patch(Rectangle((x, base), bar_width, height, facecolor=colour, edgecolor="none"))
        if height > 0.05:
            text_x = x - 0.25 if align == "right" else x + bar_width + 0.25
            axes.text(
                text_x,
                base + height / 2,
                f"{label}" + chr(10) + f"{count:,}  ({count / proposed:.0%})",
                color=theme.ink,
                fontsize=9.5,
                va="center",
                ha="right" if align == "right" else "left",
                linespacing=1.5,
            )
        return height

    # Stage 1
    proposed_h = node(1.1, 0.0, proposed, theme.accent, "proposed", "right")

    # Stage 2, stacked from the bottom: verified above refuted.
    refuted_h = top * refuted / proposed
    verified_h = top * verified / proposed
    if refuted:
        node(5.6, 0.0, refuted, theme.negative, "refuted", "left")
    node(5.6, refuted_h, verified, theme.positive, "verified", "left")

    # Stage 3
    no_gain_h = top * no_gain / proposed
    node(10.6, refuted_h, no_gain, theme.neutral, "no cost gain", "left")
    node(10.6, refuted_h + no_gain_h, improving, theme.positive, "cheaper", "left")

    # Bands. Narrower gaps than the nodes so the connection reads as a flow.
    _flow(axes, 1.65, 5.6, refuted_h, refuted_h, verified_h, verified_h, theme.positive)
    if refuted:
        _flow(axes, 1.65, 5.6, 0.0, 0.0, refuted_h, refuted_h, theme.negative)
    _flow(
        axes,
        5.9,
        10.6,
        refuted_h + no_gain_h,
        refuted_h + no_gain_h,
        top * improving / proposed,
        top * improving / proposed,
        theme.positive,
    )
    _flow(axes, 6.15, 10.6, refuted_h, refuted_h, no_gain_h, no_gain_h, theme.neutral)

    for x, caption in ((1.38, "proposed"), (5.88, "verified"), (10.88, "outcome")):
        axes.text(x, -0.09, caption, color=theme.muted, fontsize=8.5, ha="center")

    del proposed_h
    return _finish(
        figure,
        theme,
        "Where proposals end up",
        "every candidate generated, across all methods and programs",
    )


# --- 2. Accept / reject / invalid per optimization type ---------------------------


def outcomes_by_kind(rows: Rows, theme: Theme) -> Figure:
    totals = _kind_totals(_usable(rows))
    kinds = sorted(totals, key=lambda k: -totals[k]["proposed"])

    accepted = [totals[k]["accepted"] for k in kinds]
    no_gain = [totals[k]["improving"] - totals[k]["accepted"] for k in kinds]
    rejected = [
        totals[k]["proposed"] - totals[k]["improving"] - totals[k]["refuted"] for k in kinds
    ]
    refuted = [totals[k]["refuted"] for k in kinds]

    labels = [SHORT_KIND.get(k, k) for k in kinds]
    figure, axes = plt.subplots(figsize=(9, 4.6))
    positions = range(len(kinds))

    axes.barh(positions, accepted, color=theme.positive, label="accepted")
    axes.barh(
        positions,
        no_gain,
        left=accepted,
        color=theme.accent,
        alpha=0.55,
        label="cheaper but not taken",
    )
    axes.barh(
        positions,
        rejected,
        left=[a + n for a, n in zip(accepted, no_gain, strict=True)],
        color=theme.neutral,
        alpha=0.7,
        label="no cost gain",
    )
    axes.barh(
        positions,
        refuted,
        left=[a + n + r for a, n, r in zip(accepted, no_gain, rejected, strict=True)],
        color=theme.negative,
        label="refuted by verification",
    )

    axes.set_yticks(list(positions), labels)
    axes.invert_yaxis()
    axes.set_xlabel("proposals")
    axes.grid(axis="y", visible=False)
    axes.legend(loc="lower right", ncols=2)

    return _finish(
        figure,
        theme,
        "What happened to each transformation",
        "proposals broken down by outcome, per optimization type",
    )


# --- 3. Cost over iterations, five sample programs ---------------------------------


def cost_trajectories(rows: Rows, theme: Theme, method: str = "astar", samples: int = 5) -> Figure:
    usable = [row for row in _usable(rows, method) if row.get("trajectory")]
    if not usable:
        # Partial data, or that method was not run. Fall back to whatever exists
        # rather than emitting an empty figure with no legend.
        usable = [row for row in _usable(rows) if row.get("trajectory")]
        method = usable[0]["method"] if usable else method

    usable.sort(key=lambda row: -float(row["cost_reduction"]))
    chosen = usable[:samples]

    figure, axes = plt.subplots(figsize=(9, 4.6))
    for index, row in enumerate(chosen):
        values = [1.0] + [float(v) for v in row["trajectory"].split("|") if v]
        colour = theme.categorical[index % len(theme.categorical)]
        axes.plot(
            range(len(values)),
            values,
            color=colour,
            marker="o",
            markersize=3.5,
            label=f"{row['program_id']}  ({float(row['cost_reduction']):.0%})",
        )

    axes.set_xlabel("accepted transformation")
    axes.set_ylabel("cost, relative to original")
    axes.axhline(1.0, color=theme.rule, linewidth=1, linestyle=":")
    if chosen:
        axes.legend(loc="upper right")
    else:
        axes.text(
            0.5,
            0.5,
            "no trajectories recorded",
            transform=axes.transAxes,
            ha="center",
            color=theme.muted,
        )

    return _finish(
        figure,
        theme,
        "Cost falling as the agent works",
        f"five programs under {method}; 1.0 is the unoptimized original",
    )


# --- 4. Mix of applied transformations ---------------------------------------------


def applied_mix(rows: Rows, theme: Theme) -> Figure:
    counts: Counter[str] = Counter()
    for row in _usable(rows):
        counts.update(kind for kind in row["applied"].split("|") if kind)

    ordered = counts.most_common()
    labels = [SHORT_KIND.get(kind, kind) for kind, _ in ordered]
    values = [value for _, value in ordered]
    colours = [theme.categorical[i % len(theme.categorical)] for i in range(len(ordered))]

    figure, axes = plt.subplots(figsize=(7.4, 4.8))
    wedges, _ = axes.pie(
        values,
        colors=colours,
        startangle=90,
        counterclock=False,
        wedgeprops={"width": 0.42, "edgecolor": theme.paper, "linewidth": 1.5},
    )
    total = sum(values) or 1
    axes.legend(
        wedges,
        [
            f"{label}   {value:,}  ({value / total:.0%})"
            for label, value in zip(labels, values, strict=True)
        ],
        loc="center left",
        bbox_to_anchor=(1.0, 0.5),
    )
    axes.text(0, 0, f"{total:,}\naccepted", ha="center", va="center", color=theme.ink, fontsize=11)

    return _finish(
        figure,
        theme,
        "Which transformations actually got applied",
        "across every program and method",
    )


# --- 5. Steps against improvement ---------------------------------------------------


def steps_vs_improvement(rows: Rows, theme: Theme) -> Figure:
    figure, axes = plt.subplots(figsize=(9, 4.8))

    for index, category in enumerate(CATEGORY_ORDER):
        subset = [row for row in _usable(rows) if row["category"] == category]
        if not subset:
            continue
        axes.scatter(
            [int(row["accepted"]) for row in subset],
            [float(row["cost_reduction"]) for row in subset],
            s=16,
            alpha=0.55,
            linewidths=0,
            color=theme.categorical[index % len(theme.categorical)],
            label=category.replace("_", " "),
        )

    axes.set_xlabel("transformations accepted")
    axes.set_ylabel("cost reduction")
    axes.yaxis.set_major_formatter(lambda value, _: f"{value:.0%}")
    axes.legend(loc="lower right", ncols=2)

    return _finish(
        figure,
        theme,
        "Does more work mean a better result",
        "one point per program and method, coloured by category",
    )


# --- 6. Category against transformation --------------------------------------------


def category_kind_heatmap(rows: Rows, theme: Theme) -> Figure:
    kinds = list(SHORT_KIND)
    grid = [[0 for _ in kinds] for _ in CATEGORY_ORDER]

    for row in _usable(rows):
        if row["category"] not in CATEGORY_ORDER:
            continue
        y = CATEGORY_ORDER.index(row["category"])
        for kind in row["applied"].split("|"):
            if kind in kinds:
                grid[y][kinds.index(kind)] += 1

    # Normalise per category, so a category with more programs does not simply
    # look hotter everywhere.
    normalised = [[value / max(sum(line), 1) for value in line] for line in grid]

    figure, axes = plt.subplots(figsize=(9, 4.4))
    colours = matplotlib.colors.LinearSegmentedColormap.from_list(
        "autoopt", [theme.paper, theme.accent]
    )
    image = axes.imshow(normalised, cmap=colours, aspect="auto", vmin=0)

    axes.set_xticks(range(len(kinds)), [SHORT_KIND[k] for k in kinds], rotation=35, ha="right")
    axes.set_yticks(range(len(CATEGORY_ORDER)), [c.replace("_", " ") for c in CATEGORY_ORDER])
    axes.grid(visible=False)

    for y, line in enumerate(grid):
        for x, value in enumerate(line):
            if value:
                axes.text(
                    x,
                    y,
                    f"{value}",
                    ha="center",
                    va="center",
                    fontsize=7.5,
                    color=theme.paper if normalised[y][x] > 0.55 else theme.muted,
                )

    bar = figure.colorbar(image, ax=axes, fraction=0.025, pad=0.02)
    bar.set_label("share within category", color=theme.muted, fontsize=8.5)
    bar.ax.tick_params(colors=theme.muted, labelsize=8)
    bar.outline.set_edgecolor(theme.rule)

    return _finish(
        figure,
        theme,
        "Which transformation each category attracts",
        "counts shown; shading is the share within that category",
    )


FIGURES = {
    "sankey_decisions": sankey_decisions,
    "outcomes_by_kind": outcomes_by_kind,
    "cost_trajectories": cost_trajectories,
    "applied_mix": applied_mix,
    "steps_vs_improvement": steps_vs_improvement,
    "category_kind_heatmap": category_kind_heatmap,
}
