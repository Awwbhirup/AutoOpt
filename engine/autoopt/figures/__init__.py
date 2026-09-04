"""The six required figures and the metrics table."""

from __future__ import annotations

from collections.abc import Sequence
from pathlib import Path
from typing import Any, cast

import matplotlib.pyplot as plt

from .metrics import Metric, MetricsTable, by_category, by_method, compute
from .plots import FIGURES
from .statistical import STATISTICAL_FIGURES
from .theme import DARK, LIGHT, THEMES, Theme, oklch, rc_params

__all__ = [
    "DARK",
    "FIGURES",
    "LIGHT",
    "STATISTICAL_FIGURES",
    "THEMES",
    "Metric",
    "MetricsTable",
    "Theme",
    "by_category",
    "by_method",
    "compute",
    "oklch",
    "rc_params",
    "render_all",
    "render_statistical",
]


def render_all(
    rows: Sequence[dict[str, str]],
    out: Path,
    themes: Sequence[str] = ("dark", "light"),
) -> list[Path]:
    """Write every figure in every requested theme.

    Both variants come from one definition, so the dark set used in the demo and
    the light set a report might want cannot drift apart.
    """
    written: list[Path] = []

    for theme_name in themes:
        theme = THEMES[theme_name]
        directory = out / theme_name
        directory.mkdir(parents=True, exist_ok=True)

        for name, builder in FIGURES.items():
            # matplotlib types rcParams keys as a huge Literal union, which a
            # plain dict cannot satisfy.
            with plt.rc_context(cast(Any, rc_params(theme))):
                figure = builder(rows, theme)
                path = directory / f"{name}.png"
                figure.savefig(path)
                plt.close(figure)
                written.append(path)

    return written


def render_statistical(
    frame: object,
    hazard: object,
    out: Path,
    themes: Sequence[str] = ("dark", "light"),
) -> list[Path]:
    """The statistical figures, which need the analysis rather than raw rows."""
    from .statistical import hazard_curve

    written: list[Path] = []
    for theme_name in themes:
        theme = THEMES[theme_name]
        directory = out / theme_name
        directory.mkdir(parents=True, exist_ok=True)

        builders = dict(STATISTICAL_FIGURES)
        for name, builder in builders.items():
            try:
                with plt.rc_context(cast(Any, rc_params(theme))):
                    figure = builder(frame, theme)
                    path = directory / f"{name}.png"
                    figure.savefig(path)
                    plt.close(figure)
                    written.append(path)
            except Exception:
                # A figure that needs a factor this dataset does not have is
                # skipped rather than failing the whole render.
                plt.close("all")

        if hazard is not None:
            with plt.rc_context(cast(Any, rc_params(theme))):
                figure = hazard_curve(hazard, theme)
                path = directory / "hazard_curve.png"
                figure.savefig(path)
                plt.close(figure)
                written.append(path)

    return written
