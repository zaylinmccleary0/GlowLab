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


/** How far below a line of lights its glow reaches before fading out completely. */
export const GLOW_FADE_FEET = 3;

/**
 * Night glow under a line of lights: one band per segment, hanging straight down from
 * the line and fading out evenly over `feet`. Each band is described in its own
 * sheared frame so the fade is always measured straight down from the line, even
 * on a sloped roofline: draw rects from x=min(0,width) to max(0,width) inside
 * `matrix(1, slope, 0, 1, x, y)`. Vertical segments (window sides) get none.
 * `stops` color the band along its length from the bulbs on that segment (offset
 * 0 = segment start, 1 = end), already softened toward warm white.
 * All values in image pixels.
 */
export interface GlowBand { x: number; y: number; slope: number; width: number; drop: number; stops: { offset: number; color: string }[] }

export function glowBands(
  points: { x: number; y: number }[], pixelsPerFoot: number, imageSize: { width: number; height: number },
  bulbs: { x: number; y: number; color: string }[] = [], feet = GLOW_FADE_FEET,
): GlowBand[] {
  const drop = feet * pixelsPerFoot;
  const out: GlowBand[] = [];
  for (let i = 1; i < points.length; i++) {
    const ax = points[i - 1].x * imageSize.width; const ay = points[i - 1].y * imageSize.height;
    const bx = points[i].x * imageSize.width; const by = points[i].y * imageSize.height;
    const width = bx - ax;
    if (Math.abs(width) < 0.5) continue;
    const lo = Math.min(ax, bx) - 0.5; const hi = Math.max(ax, bx) + 0.5;
    const stops = bulbs
      .filter((b) => b.x >= lo && b.x <= hi && Math.abs(b.y - (ay + ((b.x - ax) / width) * (by - ay))) < Math.max(2, pixelsPerFoot * 0.5))
      .map((b) => ({ offset: Math.min(1, Math.max(0, (b.x - ax) / width)), color: softGlow(b.color) }))
      .sort((p, q) => p.offset - q.offset);
    out.push({ x: ax, y: ay, slope: (by - ay) / width, width, drop, stops: stops.length ? stops : [{ offset: 0, color: softGlow('#FFD9A0') }] });
  }
  return out;
}

/** Opacity of the glow `t` of the way down (0 = at the lights, 1 = fully faded). Kept faint so the house's own colors show through. */
export function glowOpacityAt(t: number): number {
  return 0.34 * Math.pow(Math.max(0, 1 - t), 1.6);
}

/** A bulb's color mixed 45% toward warm white, so glow tints the house without repainting it. */
export function softGlow(color: string): string {
  const mix = (i: number, w: number) => Math.round(parseInt(color.slice(i, i + 2), 16) * 0.55 + w * 0.45).toString(16).padStart(2, '0');
  return /^#[0-9a-fA-F]{6}$/.test(color) ? `#${mix(1, 0xff)}${mix(3, 0xe6)}${mix(5, 0xc4)}`.toUpperCase() : '#FFE6C4';
}
