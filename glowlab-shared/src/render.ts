import type { InstallType } from './types';

/**
 * Real-world light sizes, in inches, for drawing lights to scale on the photo.
 * Seasonal C9 bulb: ~1.2" wide x 2.4" long on a thin cord.
 * Permanent LED puck: ~1" across, mounted on a ~1.25" track.
 */
const SIZES_IN: Record<InstallType, { bulbW: number; bulbL: number; glow: number; wire: number }> = {
  seasonal: { bulbW: 1.2, bulbL: 2.4, glow: 5, wire: 0.3 },
  permanent: { bulbW: 1.0, bulbL: 1.0, glow: 4, wire: 1.25 },
};

export interface BulbDrawSize {
  /** Half-width (across the line) and half-length (along the bulb) of each bulb, in image pixels. */
  rx: number; ry: number;
  /** Radius of the soft glow around each bulb, in image pixels. */
  glowR: number;
  /** Thickness of the cord (seasonal) or track (permanent), in image pixels. */
  wire: number;
}

/**
 * Bulb drawing sizes in image pixels, from the calibration's pixels-per-foot,
 * so lights are drawn at true size relative to the house. Clamped so they stay
 * visible on far-away shots and don't balloon on close-ups.
 */
export function bulbDrawSize(pixelsPerFoot: number, imageWidth: number, installType: InstallType): BulbDrawSize {
  const s = SIZES_IN[installType];
  const pxPerIn = pixelsPerFoot / 12;
  const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
  const minR = imageWidth * 0.0012;
  const maxR = imageWidth * 0.008;
  const rx = clamp((s.bulbW / 2) * pxPerIn, minR, maxR);
  const ry = clamp((s.bulbL / 2) * pxPerIn, minR, maxR * 2);
  return {
    rx, ry,
    glowR: clamp(s.glow * pxPerIn, Math.max(rx, ry) * 2.2, imageWidth * 0.025),
    wire: clamp(s.wire * pxPerIn, imageWidth * 0.0005, imageWidth * 0.005),
  };
}
