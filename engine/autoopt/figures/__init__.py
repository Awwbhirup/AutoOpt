"""The six required figures and the metrics table."""

from __future__ import annotations

from collections.abc import Sequence
from pathlib import Path
from typing import Any, cast

import matplotlib.pyplot as plt

from .metrics import Metric, MetricsTable, by_category, by_method, compute
from .plots import FIGURES
from .theme import DARK, LIGHT, THEMES, Theme, oklch, rc_params

__all__ = [
    "DARK",
    "FIGURES",
    "LIGHT",
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
