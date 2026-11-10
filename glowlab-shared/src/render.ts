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

/**
 * Night mode "house lit up": where each bulb's light lands on the house, as soft
 * ellipses in image pixels. The light pools mostly below and around the bulb
 * (onto the siding, fascia and roof under the line) and barely reaches above it,
 * so the sky stays dark. About 3 ft to each side and ~8 ft down the wall, scaled by the calibration.
 */
export interface LightPool { cx: number; cy: number; rx: number; ry: number; color: string }

export function lightPools(
  bulbs: { x: number; y: number; color: string }[], pixelsPerFoot: number, imageWidth: number,
): LightPool[] {
  const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
  const rx = clamp(3 * pixelsPerFoot, imageWidth * 0.015, imageWidth * 0.12);
  const ry = rx * 1.6;
  const drop = ry * 0.8;
  return bulbs.map((b) => ({ cx: b.x, cy: b.y + drop, rx, ry, color: b.color }));
}

/**
 * Where the lights' glow may land: the area under each lit line, down to the bottom of
 * the picture, as polygons in pixels. Clipping the glow to this keeps the sky beside and
 * above the roofline dark. The sides are pulled in by `insetPx` (the eave overhang) so the
 * sky just past the walls stays dark too. Lines with fewer than 2 points are skipped.
 */
export function underLinePolygons(lines: { points: { x: number; y: number }[] }[], width: number, height: number, insetPx = 0): string[] {
  return lines.filter((l) => l.points.length >= 2).map((l) => {
    const p = l.points.map((q) => ({ x: q.x * width, y: q.y * height }));
    const first = p[0]; const last = p[p.length - 1];
    const dir = Math.sign(last.x - first.x);
    const inset = dir !== 0 && Math.abs(last.x - first.x) > insetPx * 4 ? insetPx * dir : 0;
    const poly = [...p, { x: last.x - inset, y: last.y }, { x: last.x - inset, y: height }, { x: first.x + inset, y: height }, { x: first.x + inset, y: first.y }];
    return poly.map((q) => `${q.x},${q.y}`).join(' ');
  });
}
