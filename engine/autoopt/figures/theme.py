"""Figure theme.

Colours are generated from OKLCH rather than picked by hand. OKLCH separates
lightness from chroma and hue, so a ramp built by varying lightness alone stays
perceptually even, where the same thing in HSL bunches up in the middle and
crushes at the ends.

Rules this follows:

- One anchor hue, and the neutrals are tinted towards it. A warm accent against
  cool grey text looks wrong in a way people notice without being able to name.
- No pure black and no pure white. Dark surfaces sit around 14% lightness, which
  is roughly the "lift off black" every dark mode guide converges on.
- The accent is used sparingly; status is never carried by colour alone, because
  accept and reject are the most repeated signal in this project and red against
  green is exactly the pair 8% of men cannot separate. Every status also gets a
  marker or a label.

Dark is the default, since submission is soft copy and the demo is on a laptop.
The light variant comes from the same definition, so the two cannot drift.
"""

from __future__ import annotations

import math
from dataclasses import dataclass

#: Anchor. Amber rather than blue, which is the default every generated chart
#: reaches for first.
ANCHOR_HUE = 66.0


def _srgb_component(value: float) -> float:
    value = 1.055 * (value ** (1 / 2.4)) - 0.055 if value > 0.0031308 else 12.92 * value
    return min(1.0, max(0.0, value))


def oklch(lightness: float, chroma: float, hue: float) -> str:
    """OKLCH to an sRGB hex string. Lightness and chroma are 0-1, hue degrees."""
    hue_radians = math.radians(hue)
    a = chroma * math.cos(hue_radians)
    b = chroma * math.sin(hue_radians)

    l_ = lightness + 0.3963377774 * a + 0.2158037573 * b
    m_ = lightness - 0.1055613458 * a - 0.0638541728 * b
    s_ = lightness - 0.0894841775 * a - 1.2914855480 * b

    long_, medium, short = l_**3, m_**3, s_**3

    red = 4.0767416621 * long_ - 3.3077115913 * medium + 0.2309699292 * short
    green = -1.2684380046 * long_ + 2.6097574011 * medium - 0.3413193965 * short
    blue = -0.0041960863 * long_ - 0.7034186147 * medium + 1.7076147010 * short

    channels = (_srgb_component(red), _srgb_component(green), _srgb_component(blue))
    return "#" + "".join(f"{round(channel * 255):02x}" for channel in channels)


@dataclass(frozen=True, slots=True)
class Theme:
    name: str
    paper: str
    surface: str
    rule: str
    muted: str
    ink: str
    accent: str
    positive: str
    negative: str
    neutral: str
    categorical: tuple[str, ...]
    sequential: tuple[str, ...]

    @property
    def is_dark(self) -> bool:
        return self.name == "dark"


def _categorical(lightness: float, chroma: float) -> tuple[str, ...]:
    """Eight hues for the eight transformations, evenly spaced around the wheel.

    Even spacing in OKLCH keeps them equally distinguishable, which the same
    spacing in HSL would not.
    """
    return tuple(oklch(lightness, chroma, (ANCHOR_HUE + index * 45) % 360) for index in range(8))


DARK = Theme(
    name="dark",
    paper=oklch(0.14, 0.010, ANCHOR_HUE),
    surface=oklch(0.19, 0.012, ANCHOR_HUE),
    rule=oklch(0.32, 0.010, ANCHOR_HUE),
    muted=oklch(0.62, 0.012, ANCHOR_HUE),
    ink=oklch(0.94, 0.006, ANCHOR_HUE),
    accent=oklch(0.78, 0.150, ANCHOR_HUE),
    positive=oklch(0.76, 0.130, 150),
    negative=oklch(0.68, 0.150, 25),
    neutral=oklch(0.60, 0.020, ANCHOR_HUE),
    # Saturation pulled back for dark: a vibrant accent on a dark surface reads
    # about twice as loud as the same accent on white.
    categorical=_categorical(0.74, 0.115),
    sequential=tuple(
        oklch(0.22 + 0.09 * step, 0.055 + 0.012 * step, ANCHOR_HUE) for step in range(8)
    ),
)

LIGHT = Theme(
    name="light",
    paper=oklch(0.985, 0.004, ANCHOR_HUE),
    surface=oklch(0.955, 0.008, ANCHOR_HUE),
    rule=oklch(0.85, 0.010, ANCHOR_HUE),
    muted=oklch(0.55, 0.014, ANCHOR_HUE),
    ink=oklch(0.24, 0.012, ANCHOR_HUE),
    accent=oklch(0.58, 0.170, ANCHOR_HUE),
    positive=oklch(0.52, 0.140, 150),
    negative=oklch(0.53, 0.180, 25),
    neutral=oklch(0.62, 0.020, ANCHOR_HUE),
    categorical=_categorical(0.60, 0.145),
    sequential=tuple(
        oklch(0.95 - 0.085 * step, 0.020 + 0.020 * step, ANCHOR_HUE) for step in range(8)
    ),
)

THEMES = {"dark": DARK, "light": LIGHT}


def rc_params(theme: Theme) -> dict[str, object]:
    """Matplotlib settings for a theme.

    Everything is set here rather than per figure, so the six plots cannot drift
    apart from each other.
    """
    return {
        "figure.facecolor": theme.paper,
        "figure.edgecolor": theme.paper,
        "savefig.facecolor": theme.paper,
        "savefig.edgecolor": theme.paper,
        "axes.facecolor": theme.paper,
        "axes.edgecolor": theme.rule,
        "axes.labelcolor": theme.muted,
        "axes.titlecolor": theme.ink,
        "axes.grid": True,
        "axes.axisbelow": True,
        "axes.spines.top": False,
        "axes.spines.right": False,
        "axes.titlesize": 12,
        "axes.titleweight": 500,
        "axes.titlepad": 14,
        "axes.labelsize": 9,
        "grid.color": theme.rule,
        "grid.linewidth": 0.6,
        "grid.alpha": 0.5,
        "text.color": theme.ink,
        "xtick.color": theme.muted,
        "ytick.color": theme.muted,
        "xtick.labelsize": 8.5,
        "ytick.labelsize": 8.5,
        "xtick.direction": "out",
        "ytick.direction": "out",
        "legend.frameon": False,
        "legend.fontsize": 8.5,
        "legend.labelcolor": theme.muted,
        "font.family": "sans-serif",
        "font.sans-serif": ["Segoe UI", "Inter", "Helvetica Neue", "Arial", "DejaVu Sans"],
        "font.size": 9.5,
        "figure.dpi": 140,
        "savefig.dpi": 200,
        "savefig.bbox": "tight",
        "lines.linewidth": 1.6,
        "patch.linewidth": 0,
    }
