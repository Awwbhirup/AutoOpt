"""Generate the landing page's generated images.

The displacement maps the glass surfaces refract through, and the grain that
sits over the backdrop.

An feDisplacementMap moves each pixel of what it filters by an amount read out
of another image: the red channel drives the horizontal shift and the green
channel the vertical, with a mid grey of 128 meaning "do not move". So a map
that is flat grey in the middle and slopes toward the edges bends whatever is
behind it only near its border, which is what glass with a rounded edge does.

The band is what makes it read as thick glass rather than a blur. Inside it the
displacement points along the outward normal of a rounded rectangle, easing to
nothing a little way in, so straight edges behind the panel bow outward as they
pass under the rim and corners twist the way they do through a lens.

Two maps, because the filter stretches its map over whatever it is applied to
and a square map on a wide header would smear the band along the top and bottom.

    python scripts/make_glass_maps.py
"""

from __future__ import annotations

import math
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "web" / "public"

#: How far in from the edge the refraction reaches, as a share of the shorter
#: side. Much more and the panel looks like a fisheye; much less and the effect
#: disappears under the blur that follows it.
BAND = 0.16
#: Peak displacement, as a share of 127. The filter scales this again, so this
#: only has to keep the ramp smooth without clipping.
STRENGTH = 0.95


def rounded_box_sdf(x: float, y: float, half_w: float, half_h: float, radius: float) -> float:
    """Signed distance to a rounded rectangle centred on the origin.

    Negative inside. The standard formulation: fold into one quadrant, measure
    against a box inset by the corner radius, then subtract the radius back.
    """
    qx = abs(x) - (half_w - radius)
    qy = abs(y) - (half_h - radius)
    outside = math.hypot(max(qx, 0.0), max(qy, 0.0))
    inside = min(max(qx, qy), 0.0)
    return outside + inside - radius


def build(width: int, height: int, radius_fraction: float) -> Image.Image:
    image = Image.new("RGB", (width, height), (128, 128, 0))
    pixels = image.load()
    assert pixels is not None

    half_w = width / 2
    half_h = height / 2
    short = min(width, height)
    radius = short * radius_fraction
    band = short * BAND

    for py in range(height):
        for px in range(width):
            x = px + 0.5 - half_w
            y = py + 0.5 - half_h
            distance = rounded_box_sdf(x, y, half_w, half_h, radius)

            if distance > 0 or distance < -band:
                # Outside the shape, or far enough in to be undisturbed.
                pixels[px, py] = (128, 128, 0)
                continue

            # The outward normal, from the gradient of the distance field. Taken
            # numerically because the analytic gradient of the rounded-box field
            # is piecewise and the seams show up as creases in the map.
            step = 1.0
            gx = rounded_box_sdf(x + step, y, half_w, half_h, radius) - rounded_box_sdf(
                x - step, y, half_w, half_h, radius
            )
            gy = rounded_box_sdf(x, y + step, half_w, half_h, radius) - rounded_box_sdf(
                x, y - step, half_w, half_h, radius
            )
            length = math.hypot(gx, gy) or 1.0
            nx, ny = gx / length, gy / length

            # Strongest at the very edge, gone by the inner lip of the band.
            # Smoothstep rather than linear, so the inner boundary does not
            # leave a visible line where the displacement stops.
            t = 1.0 - (-distance / band)
            falloff = t * t * (3 - 2 * t)

            amount = falloff * STRENGTH * 127
            pixels[px, py] = (
                int(round(128 + nx * amount)),
                int(round(128 + ny * amount)),
                0,
            )

    return image


def grain(size: int = 128) -> Image.Image:
    """A tileable field of monochrome noise.

    This was an feTurbulence filter over a full-screen rect, which the browser
    regenerates whenever it repaints that area. It never changes, so it is an
    image: one tile repeated costs a texture upload once and nothing after.

    One channel, and sixteen levels of it. Full-range RGB noise is close to
    incompressible and came out at 170 KB for a texture that is laid over the
    page at sixteen percent opacity; at this depth the difference is invisible
    and the file is a fraction of that.

    Seeded, so the file is identical every run and the repo does not show a
    diff for an image nobody edited.
    """
    import random

    rng = random.Random(7)
    levels = 16
    step = 256 // levels
    image = Image.new("L", (size, size))
    image.putdata([rng.randrange(levels) * step for _ in range(size * size)])
    return image


def main() -> int:
    OUT.mkdir(parents=True, exist_ok=True)
    for name, size, radius in (
        # A wide bar, for the header.
        ("glass-bar.png", (512, 96), 0.42),
        # Roughly square, for panels and cards.
        ("glass-card.png", (256, 256), 0.12),
    ):
        image = build(size[0], size[1], radius)
        path = OUT / name
        image.save(path, optimize=True)
        print(f"{path.relative_to(ROOT)}  {size[0]}x{size[1]}  {path.stat().st_size:,} bytes")

    noise = OUT / "grain.png"
    image = grain()
    image.save(noise, optimize=True, bits=4)
    print(f"{noise.relative_to(ROOT)}  {image.size[0]}x{image.size[1]}  {noise.stat().st_size:,} bytes")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
