// Hand-checkable checks for @glowlab/shared. Run: npm run build && npm test
import assert from 'node:assert';
import {
  PRESETS, DEFAULT_PRICING, getPreset, calibrationPixelsPerFoot, polylineLengthFeet,
  bulbPositions, computeEstimate, totalFeet,
} from '../dist/index.js';

assert.equal(PRESETS.length, 7);
assert.equal(getPreset('candy-cane').bulbColors.length, 2);
assert.equal(getPreset('multicolor-nostalgia').bulbColors.length, 5);
assert.equal(getPreset('icicles-roofline').icicle, true);
assert.ok(getPreset('elegant-full-home').includesWreath);

// Geometry: image 1000x1000, calibration (0,0)->(0.1,0) = 100px = 10 ft => 10 px/ft
const size = { width: 1000, height: 1000 };
const cal = { a: { x: 0, y: 0 }, b: { x: 0.1, y: 0 }, realFeet: 10 };
assert.equal(calibrationPixelsPerFoot(cal, size), 10);
const line = { id: 'l1', kind: 'roofline', points: [{ x: 0, y: 0 }, { x: 0.5, y: 0 }] };
assert.equal(polylineLengthFeet(line.points, cal, size), 50); // 500px / 10 px-per-ft
// Non-square image: 2000x500, calibration (0,0)->(0.05,0)=100px=10ft => 10 px/ft; vertical (0,0)->(0,1)=500px=50ft
const wide = { width: 2000, height: 500 };
const calWide = { a: { x: 0, y: 0 }, b: { x: 0.05, y: 0 }, realFeet: 10 };
assert.equal(calibrationPixelsPerFoot(calWide, wide), 10);
assert.equal(polylineLengthFeet([{ x: 0, y: 0 }, { x: 0, y: 1 }], calWide, wide), 50);

// Bulbs: convention = one bulb at the start of each spacing interval, far endpoint excluded.
// 50 ft at 12" spacing => 50 bulbs, indices 0..49
const positions = bulbPositions(line, cal, size, 12);
assert.equal(positions.length, 50);
assert.deepEqual(positions[0].point, { x: 0, y: 0 });
assert.ok(Math.abs(positions[1].point.x - 0.01) < 1e-9); // 1 ft = 10px = 0.01 of width
assert.equal(positions[49].index, 49);

// Candy-cane pattern alternates via index: even = red #FF2D2D, odd = warm white #FFD9A0
const candy = getPreset('candy-cane');
const colorAt = (i) => candy.bulbColors[i % candy.bulbColors.length];
assert.equal(colorAt(positions[0].index), '#FF2D2D');
assert.equal(colorAt(positions[1].index), '#FFD9A0');
assert.equal(colorAt(positions[2].index), '#FF2D2D');

// Pricing, hand-computed with DEFAULT_PRICING (base $7.50/ft rental):
// 50 ft roofline, classic preset, 1 story, not steep, no add-ons
//   per-foot: 50 x 7.50 = $375.00 ; bulbs = ceil(50*12/12) = 50 ; deposit = 187.50
const project = {
  clientName: 'Test', address: '1 Test Ln', photoDataUrl: null,
  imageWidth: 1000, imageHeight: 1000, calibration: cal, lines: [line],
  presetId: 'classic-warm-white',
  estimateOptions: { stories: 1, steepRoof: false, model: 'rental', addOns: { wreaths: 0, pathwayStakes: 0, treeWraps: 0, timers: 0 } },
  id: 'p1', createdAt: '', updatedAt: '',
};
assert.equal(totalFeet(project, getPreset('classic-warm-white')), 50);
const est = computeEstimate(project, getPreset('classic-warm-white'), DEFAULT_PRICING, project.estimateOptions);
assert.equal(est.totalFeet, 50);
assert.equal(est.bulbCount, 50);
assert.equal(est.clipCount, 50);
assert.equal(est.total, 375);
assert.equal(est.depositDue, 187.5);

// Full case: purchase + 2nd story + steep + add-ons
//   per-foot: 50 x 7.50 x 1.6 x 1.25 = $750.00
//   add-ons: 1 wreath $85 + 10 stakes $180 + 1 tree wrap $120 + 1 timer $45 = $430
//   steep fee $150  =>  total $1,330.00, deposit $665.00
const est2 = computeEstimate(project, getPreset('classic-warm-white'), DEFAULT_PRICING, {
  stories: 2, steepRoof: true, model: 'purchase',
  addOns: { wreaths: 1, pathwayStakes: 10, treeWraps: 1, timers: 1 },
});
assert.equal(est2.lines[0].amount, 750);
assert.equal(est2.total, 1330);
assert.equal(est2.depositDue, 665);

// Preset filtering: a window line does not count toward Classic Warm White (roofline only)
const project2 = { ...project, lines: [line, { id: 'l2', kind: 'window', points: [{ x: 0, y: 0 }, { x: 0.2, y: 0 }] }] };
assert.equal(totalFeet(project2, getPreset('classic-warm-white')), 50);
assert.equal(totalFeet(project2), 70);

console.log('shared tests: all passed');
