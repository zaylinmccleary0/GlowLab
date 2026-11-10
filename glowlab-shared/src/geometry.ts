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
 * Bulb placement convention: one bulb at the START of each spacing interval
 * along the line (distance 0, spacing, 2*spacing, ... while distance < length).
 * The far endpoint does not get its own bulb — it is the start of the next run
 * (or a corner shared with the next segment). This makes the rendered count
 * equal ceil(lengthFeet / spacingFeet), exactly matching computeEstimate's
 * bulbCount = ceil(totalFeet * 12 / spacingInches). E.g. 50 ft at 12" spacing
 * renders 50 bulbs.
 */
export function bulbPositions(
  line: TracedLine, calibration: Calibration | null, imageSize: ImageSize, spacingInches: number,
): BulbPosition[] {
  const ppf = calibrationPixelsPerFoot(calibration, imageSize);
  if (ppf === null || line.points.length === 0) return [];
  const spacingPx = (spacingInches / 12) * ppf;
  if (!(spacingPx > 0)) return [];
  // Build segment table in pixel space.
  const segs: { a: Point; b: Point; len: number; start: number }[] = [];
  let totalPx = 0;
  for (let i = 1; i < line.points.length; i++) {
    const len = segPx(line.points[i - 1], line.points[i], imageSize);
    segs.push({ a: line.points[i - 1], b: line.points[i], len, start: totalPx });
    totalPx += len;
  }
  if (segs.length === 0) {
    return [{ point: line.points[0], angleDeg: 0, index: 0 }];
  }
  const out: BulbPosition[] = [];
  let index = 0;
  for (let d = 0; d < totalPx - 1e-9; d += spacingPx, index++) {
    const seg = segs.find((s) => d >= s.start && d <= s.start + s.len) ?? segs[segs.length - 1];
    const t = seg.len === 0 ? 0 : (d - seg.start) / seg.len;
    const point: Point = { x: seg.a.x + (seg.b.x - seg.a.x) * t, y: seg.a.y + (seg.b.y - seg.a.y) * t };
    const angleDeg = Math.atan2((seg.b.y - seg.a.y) * imageSize.height, (seg.b.x - seg.a.x) * imageSize.width) * (180 / Math.PI);
    out.push({ point, angleDeg, index });
  }
  return out;
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
