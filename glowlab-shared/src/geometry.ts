import type { BulbPosition, Calibration, ImageSize, Point, Preset, Project, TracedLine } from './types';

function segPx(a: Point, b: Point, size: ImageSize): number {
  const dx = (b.x - a.x) * size.width;
  const dy = (b.y - a.y) * size.height;
  return Math.sqrt(dx * dx + dy * dy);
}

/** Pixels per real foot, from the calibration segment. Null when unusable. */
export function calibrationPixelsPerFoot(calibration: Calibration | null, imageSize: ImageSize): number | null {
  if (!calibration || !(calibration.realFeet > 0)) return null;
  const px = segPx(calibration.a, calibration.b, imageSize);
  if (!(px > 0)) return null;
  return px / calibration.realFeet;
}

/** Length of a polyline in feet. 0 when there is no usable calibration. */
export function polylineLengthFeet(points: Point[], calibration: Calibration | null, imageSize: ImageSize): number {
  const ppf = calibrationPixelsPerFoot(calibration, imageSize);
  if (ppf === null || points.length < 2) return 0;
  let px = 0;
  for (let i = 1; i < points.length; i++) px += segPx(points[i - 1], points[i], imageSize);
  return px / ppf;
}

/** Per-line lengths in feet, keyed by line id. */
export function lineLengthsFeet(
  project: Pick<Project, 'lines' | 'calibration' | 'imageWidth' | 'imageHeight'>,
): Record<string, number> {
  const size: ImageSize = { width: project.imageWidth, height: project.imageHeight };
  const out: Record<string, number> = {};
  for (const line of project.lines) out[line.id] = polylineLengthFeet(line.points, project.calibration, size);
  return out;
}

/** Total traced feet. When a preset is given, only lines it applies to count. */
export function totalFeet(
  project: Pick<Project, 'lines' | 'calibration' | 'imageWidth' | 'imageHeight'>,
  preset?: Preset,
): number {
  const size: ImageSize = { width: project.imageWidth, height: project.imageHeight };
  let total = 0;
  for (const line of project.lines) {
    if (preset && !preset.appliesTo.includes(line.kind)) continue;
    total += polylineLengthFeet(line.points, project.calibration, size);
  }
  return total;
}

/**
 * Bulb placement, the way installers hang lights: a bulb is fixed on every traced
 * point (each peak, valley and corner, plus both ends of the line), then the run
 * between two of those points gets bulbs spread evenly at the spacing closest to
 * the chosen one. E.g. a 10 ft run at 15" gets 8 gaps of exactly 15"; a 10'4" run
 * gets 8 gaps of 15.5". Points closer than half a spacing to the previous bulbed
 * point are skipped so tracing jitter doesn't bunch bulbs up. A line traced closed
 * (last point on the first) doesn't double the shared bulb. Indices count from the
 * start of the line, which is what pattern colors and painted bulbs key on.
 */
export function bulbPositions(
  line: TracedLine, calibration: Calibration | null, imageSize: ImageSize, spacingInches: number,
): BulbPosition[] {
  const ppf = calibrationPixelsPerFoot(calibration, imageSize);
  const pts = line.points;
  if (ppf === null || pts.length === 0) return [];
  const spacingPx = (spacingInches / 12) * ppf;
  if (!(spacingPx > 0)) return [];
  const cum = [0];
  for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + segPx(pts[i - 1], pts[i], imageSize));
  const total = cum[cum.length - 1];
  if (pts.length === 1 || total <= 0) return [{ point: pts[0], angleDeg: 0, index: 0 }];

  const segAngle = (s: number) => Math.atan2((pts[s + 1].y - pts[s].y) * imageSize.height, (pts[s + 1].x - pts[s].x) * imageSize.width);
  const nonZeroSeg = (s: number, step: number) => { while (s >= 0 && s < pts.length - 1 && cum[s + 1] - cum[s] <= 1e-9) s += step; return Math.min(pts.length - 2, Math.max(0, s)); };
  const toDeg = (r: number) => (r * 180) / Math.PI;

  // Points that get a fixed bulb.
  const anchors = [0];
  for (let i = 1; i < pts.length - 1; i++) if (cum[i] - cum[anchors[anchors.length - 1]] >= spacingPx * 0.5) anchors.push(i);
  if (anchors.length > 1 && total - cum[anchors[anchors.length - 1]] < spacingPx * 0.5) anchors.pop();
  anchors.push(pts.length - 1);

  const out: BulbPosition[] = [];
  const at = (d: number, angleRad: number) => {
    let s = 0;
    while (s < pts.length - 2 && d > cum[s + 1]) s++;
    const len = cum[s + 1] - cum[s];
    const tt = len <= 0 ? 0 : Math.min(1, Math.max(0, (d - cum[s]) / len));
    out.push({ point: { x: pts[s].x + (pts[s + 1].x - pts[s].x) * tt, y: pts[s].y + (pts[s + 1].y - pts[s].y) * tt }, angleDeg: toDeg(angleRad), index: out.length });
  };
  // At a corner the bulb follows the average direction of the two sides, so a peak bulb stands straight up.
  const cornerAngle = (i: number) => {
    if (i === 0) return segAngle(nonZeroSeg(0, 1));
    if (i === pts.length - 1) return segAngle(nonZeroSeg(pts.length - 2, -1));
    const a = segAngle(nonZeroSeg(i - 1, -1)); const b = segAngle(nonZeroSeg(i, 1));
    return Math.atan2(Math.sin(a) + Math.sin(b), Math.cos(a) + Math.cos(b));
  };
  const closed = pts.length > 2 && segPx(pts[0], pts[pts.length - 1], imageSize) < spacingPx * 0.25;
  for (let k = 0; k < anchors.length - 1; k++) {
    const i = anchors[k]; const j = anchors[k + 1];
    const run = cum[j] - cum[i];
    const gaps = Math.max(1, Math.round(run / spacingPx));
    at(cum[i], cornerAngle(i));
    for (let m = 1; m < gaps; m++) {
      const d = cum[i] + (run * m) / gaps;
      let s = 0; while (s < pts.length - 2 && d > cum[s + 1]) s++;
      at(d, segAngle(s));
    }
  }
  if (!closed) at(total, cornerAngle(pts.length - 1));
  return out;
}

/** Total bulbs drawn on the lines a preset lights, at the given spacing. */
export function bulbCountForProject(
  project: Pick<Project, 'lines' | 'calibration' | 'imageWidth' | 'imageHeight'>, preset: Preset, spacingInches: number,
): number {
  const size: ImageSize = { width: project.imageWidth, height: project.imageHeight };
  let n = 0;
  for (const line of project.lines) {
    if (!preset.appliesTo.includes(line.kind) || line.points.length < 2) continue;
    n += bulbPositions(line, project.calibration, size, spacingInches).length;
  }
  return n;
}

/**
 * The bulb closest to a tapped point, for painting individual bulbs. Only lines the
 * preset lights are considered. Returns null when nothing is within about one bulb
 * spacing (or 3% of the image width, whichever is larger) of the tap.
 */
export function nearestBulb(
  project: Pick<Project, 'lines' | 'calibration' | 'imageWidth' | 'imageHeight'>,
  preset: Preset, spacingInches: number, tap: Point,
): { lineId: string; index: number } | null {
  const size: ImageSize = { width: project.imageWidth, height: project.imageHeight };
  const ppf = calibrationPixelsPerFoot(project.calibration, size);
  if (ppf === null) return null;
  const maxDist = Math.max((spacingInches / 12) * ppf * 0.75, size.width * 0.03);
  let best: { lineId: string; index: number; d: number } | null = null;
  for (const line of project.lines) {
    if (!preset.appliesTo.includes(line.kind)) continue;
    for (const b of bulbPositions(line, project.calibration, size, spacingInches)) {
      const d = segPx(b.point, tap, size);
      if (d <= maxDist && (!best || d < best.d)) best = { lineId: line.id, index: b.index, d };
    }
  }
  return best ? { lineId: best.lineId, index: best.index } : null;
}
