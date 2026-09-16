/**
 * The colour ramp both charts are drawn with, and the maths for mixing it.
 *
 * Violet through to green. On the ridgeline it is applied by rank, so hue
 * carries how much a method actually takes off; on the run chart the two ends
 * of it carry kept and refused. Shared so the two charts cannot drift into two
 * palettes, which is what happens when each keeps its own copy.
 *
 * Components rather than strings, because a draw loop needs the same colour at
 * several opacities per frame and assembling those by string surgery on an
 * rgb() is how one of them ends up malformed and silently transparent.
 */

export interface Rgb {
  r: number;
  g: number;
  b: number;
}

export const RAMP = ["#8b5cf6", "#5b7cfa", "#2aa8f2", "#1fd4c3", "#3ef2a0"];

/** Kept, and refused. Both read off the page's own tokens. */
export const KEPT: Rgb = { r: 62, g: 242, b: 160 };
export const REFUSED: Rgb = { r: 255, g: 101, b: 132 };

export function hexToRgb(hex: string): Rgb {
  return {
    r: parseInt(hex.slice(1, 3), 16),
    g: parseInt(hex.slice(3, 5), 16),
    b: parseInt(hex.slice(5, 7), 16),
  };
}

export function mix(a: Rgb, b: Rgb, t: number): Rgb {
  return {
    r: Math.round(a.r + (b.r - a.r) * t),
    g: Math.round(a.g + (b.g - a.g) * t),
    b: Math.round(a.b + (b.b - a.b) * t),
  };
}

/** The ramp, sampled at a position in a series of `count`. */
export function rampAt(index: number, count: number): Rgb {
  if (count <= 1) return hexToRgb(RAMP[RAMP.length - 1]);
  const position = (index / (count - 1)) * (RAMP.length - 1);
  const low = Math.floor(position);
  const high = Math.min(low + 1, RAMP.length - 1);
  return mix(hexToRgb(RAMP[low]), hexToRgb(RAMP[high]), position - low);
}

export function css({ r, g, b }: Rgb, alpha = 1): string {
  return alpha >= 1 ? `rgb(${r}, ${g}, ${b})` : `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

export function easeOutCubic(t: number): number {
  return 1 - Math.pow(1 - t, 3);
}
