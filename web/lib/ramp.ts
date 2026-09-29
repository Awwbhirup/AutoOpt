/**
 * The rank ramp at a fraction, for inline styles and SVG where a CSS variable
 * cannot be interpolated. Reads the landing page's ramp so there is one list
 * of stops, not two.
 */

import { css, hexToRgb, mix, RAMP } from "../components/landing/ramp";

/** The ramp at t in [0, 1], worse to better; clamped, and NaN reads as 0. */
export function rampAt(t: number): string {
  const clamped = Number.isFinite(t) ? Math.min(Math.max(t, 0), 1) : 0;
  const scaled = clamped * (RAMP.length - 1);
  const index = Math.min(Math.floor(scaled), RAMP.length - 2);
  return css(mix(hexToRgb(RAMP[index]), hexToRgb(RAMP[index + 1]), scaled - index));
}
