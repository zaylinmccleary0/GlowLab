// Hand-checkable checks for @glowlab/shared. Run: npm run build && npm test
import assert from 'node:assert';
import {
  PRESETS, DEFAULT_PRICING, getPreset, calibrationPixelsPerFoot, polylineLengthFeet,
  bulbPositions, computeEstimate, totalFeet, normalizeEstimateOptions, bulbDrawSize, newPricingProfile, validatePricingSettings, bulbColorFor, nearestBulb, lightPools,
} from '../dist/index.js';

assert.equal(PRESETS.length, 8);
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

// Bulbs: one on every traced point (both ends too), evenly spaced in between.
// 50 ft at 12" spacing => 50 gaps => 51 bulbs, indices 0..50, last one on the end point
const positions = bulbPositions(line, cal, size, 12);
assert.equal(positions.length, 51);
assert.deepEqual(positions[0].point, { x: 0, y: 0 });
assert.ok(Math.abs(positions[1].point.x - 0.01) < 1e-9); // 1 ft = 10px = 0.01 of width
assert.equal(positions[50].index, 50);
assert.ok(Math.abs(positions[50].point.x - 0.5) < 1e-9);

// A gable: up 100px/over 100px each side = 14.14 ft per side. At 15" that's 11.3 => 11 even gaps
// per side (15.4" each), with a bulb exactly on the peak standing straight up (angle 0 = level).
const gable = { id: 'g', kind: 'roofline', points: [{ x: 0, y: 0.2 }, { x: 0.1, y: 0.1 }, { x: 0.2, y: 0.2 }] };
const gb = bulbPositions(gable, cal, size, 15);
assert.equal(gb.length, 23);
assert.ok(Math.abs(gb[11].point.x - 0.1) < 1e-9 && Math.abs(gb[11].point.y - 0.1) < 1e-9);
assert.ok(Math.abs(gb[11].angleDeg) < 1e-9);
assert.ok(Math.abs(gb[22].point.x - 0.2) < 1e-9);
// An off-center peak still gets its bulb: 3 ft 4 in then 7 ft => 3 gaps then 6 gaps (at 15")
const offCenter = { id: 'o', kind: 'roofline', points: [{ x: 0, y: 0 }, { x: 0.0333, y: 0 }, { x: 0.1033, y: 0 }] };
const oc = bulbPositions(offCenter, cal, size, 15);
assert.equal(oc.length, 10);
assert.ok(Math.abs(oc[3].point.x - 0.0333) < 1e-9);
// A tracing wobble closer than half a spacing (5px = 6") doesn't get its own bulb
const wobble = { id: 'w', kind: 'roofline', points: [{ x: 0, y: 0 }, { x: 0.005, y: 0 }, { x: 0.1, y: 0 }] };
assert.equal(bulbPositions(wobble, cal, size, 15).length, 9); // 10 ft => 8 gaps of 15"
// A closed outline (last point back on the first) doesn't double the corner bulb: 4 sides of 10 ft = 32 bulbs
const box = { id: 'b', kind: 'window', points: [{ x: 0, y: 0 }, { x: 0.1, y: 0 }, { x: 0.1, y: 0.1 }, { x: 0, y: 0.1 }, { x: 0, y: 0 }] };
assert.equal(bulbPositions(box, cal, size, 15).length, 32);

// Night light pools: ~3 ft across each way, sitting mostly below the bulb
const pool = lightPools([{ x: 100, y: 100, color: '#fff' }], 10, 1000)[0];
assert.equal(pool.rx, 30);
assert.ok(pool.cy > 100 && pool.cy - pool.ry < 100 && pool.cy - pool.ry > 90);

// Candy-cane pattern alternates via index: even = red #FF2D2D, odd = warm white #FFD9A0
const candy = getPreset('candy-cane');
const colorAt = (i) => candy.bulbColors[i % candy.bulbColors.length];
assert.equal(colorAt(positions[0].index), '#FF2D2D');
assert.equal(colorAt(positions[1].index), '#FFD9A0');
assert.equal(colorAt(positions[2].index), '#FF2D2D');

// Pricing, hand-computed with DEFAULT_PRICING (one "Standard" list: seasonal $7.50/ft, permanent $25/ft, bulbs every 15"):
// 50 ft roofline, classic preset, seasonal, 1 story, not steep, no add-ons
//   per-foot: 50 x 7.50 = $375.00 ; bulbs = 50*12/15 = 40 gaps => 41 bulbs ; deposit = 187.50
const opts = { stories: 1, steepRoof: false, installType: 'seasonal', pricingProfileId: null, ratePerFoot: null, addOns: { wreaths: 0, pathwayStakes: 0, treeWraps: 0, timers: 0 } };
const project = {
  clientName: 'Test', address: '1 Test Ln', photoDataUrl: null,
  imageWidth: 1000, imageHeight: 1000, calibration: cal, lines: [line],
  presetId: 'classic-warm-white', estimateOptions: opts,
  id: 'p1', createdAt: '', updatedAt: '',
};
const classic = getPreset('classic-warm-white');
const std = DEFAULT_PRICING.profiles[0];
assert.equal(DEFAULT_PRICING.profiles.length, 1);
assert.equal(std.bulbSpacingInches, 15);
assert.equal(totalFeet(project, classic), 50);
const est = computeEstimate(project, classic, DEFAULT_PRICING, opts);
assert.equal(est.totalFeet, 50);
assert.equal(est.bulbCount, 41);
assert.equal(est.clipCount, 41);
assert.equal(est.total, 375);
assert.equal(est.depositDue, 187.5);
// Drawn bulbs match the count: 50 ft at 15" => 41 bulbs
assert.equal(bulbPositions(line, cal, size, std.bulbSpacingInches).length, 41);

// Permanent: 50 x $25 = $1,250.00
const perm = computeEstimate(project, classic, DEFAULT_PRICING, { ...opts, installType: 'permanent' });
assert.equal(perm.total, 1250);
assert.ok(perm.lines[0].label.includes('Permanent'));

// Custom rate for this job: 50 x $10 = $500, whichever install type
assert.equal(computeEstimate(project, classic, DEFAULT_PRICING, { ...opts, ratePerFoot: 10 }).total, 500);
assert.equal(computeEstimate(project, classic, DEFAULT_PRICING, { ...opts, installType: 'permanent', ratePerFoot: 10 }).total, 500);

// Several saved price lists: the job's pick wins; unknown/null falls back to the first
const premium = { ...newPricingProfile('premium', 'Premium'), bulbSpacingInches: 12 };
premium.seasonal = { ...premium.seasonal, ratePerFoot: 9, wreathPrice: 100 };
const two = { profiles: [std, premium] };
const prem = computeEstimate(project, classic, two, { ...opts, pricingProfileId: 'premium', addOns: { ...opts.addOns, wreaths: 1 } });
assert.equal(prem.lines[0].amount, 450); // 50 x $9
assert.equal(prem.lines[1].amount, 100); // premium wreath price
assert.equal(prem.bulbCount, 51); // premium spacing 12" => 50 gaps => 51 bulbs
assert.equal(computeEstimate(project, classic, two, { ...opts, pricingProfileId: 'deleted' }).total, 375);

// Full case: permanent + 2nd story + steep + add-ons (default permanent card)
//   per-foot: 50 x 25 x 1.25 = $1,562.50
//   add-ons: 1 wreath $85 + 10 stakes $180 + 1 tree wrap $120 = $385 (timers $0 on permanent)
//   steep fee $250  =>  total $2,197.50, deposit $1,098.75
const est2 = computeEstimate(project, classic, DEFAULT_PRICING, {
  stories: 2, steepRoof: true, installType: 'permanent', pricingProfileId: null, ratePerFoot: null,
  addOns: { wreaths: 1, pathwayStakes: 10, treeWraps: 1, timers: 0 },
});
assert.equal(est2.lines[0].amount, 1562.5);
assert.equal(est2.total, 2197.5);
assert.equal(est2.depositDue, 1098.75);

// Old saved projects (rental/purchase `model`, no installType) read as seasonal on the default list
const legacy = normalizeEstimateOptions({ stories: 1, steepRoof: false, model: 'purchase', addOns: { wreaths: 2 } });
assert.equal(legacy.installType, 'seasonal');
assert.equal(legacy.pricingProfileId, null);
assert.equal(legacy.ratePerFoot, null);
assert.equal(legacy.addOns.wreaths, 2);
assert.equal(legacy.addOns.timers, 0);
assert.equal(normalizeEstimateOptions({ ratePerFoot: -3 }).ratePerFoot, null);

// Settings validation
assert.ok(validatePricingSettings(DEFAULT_PRICING).settings);
assert.ok(validatePricingSettings({ profiles: [] }).error);
assert.ok(validatePricingSettings({ profiles: [std, premium, { ...std, id: 'c' }, { ...std, id: 'd' }] }).error); // max 3
assert.ok(validatePricingSettings({ profiles: [std, { ...premium, id: 'standard' }] }).error); // duplicate id
assert.ok(validatePricingSettings({ profiles: [{ ...std, name: ' ' }] }).error);
assert.ok(validatePricingSettings({ profiles: [{ ...std, bulbSpacingInches: 0 }] }).error);
assert.ok(validatePricingSettings({ profiles: [{ ...std, permanent: { ...std.permanent, ratePerFoot: '' } }] }).error);
assert.ok(validatePricingSettings({ profiles: [{ ...std, seasonal: { ...std.seasonal, wreathPrice: -1 } }] }).error);

// To-scale drawing: 10 px/ft => C9 is 1.2" x 2.4" => rx 0.5px, ry 1px before clamping;
// on a 1000px-wide image the minimum radius is 1.2px, so both clamp up to 1.2.
const small = bulbDrawSize(10, 1000, 'seasonal');
assert.ok(Math.abs(small.rx - 1.2) < 1e-9 && Math.abs(small.ry - 1.2) < 1e-9);
// Close-up, 120 px/ft (10 px/in): C9 rx = 0.6" = 6px, ry = 1.2" = 12px (true size, no clamping)
const close = bulbDrawSize(120, 4000, 'seasonal');
assert.ok(Math.abs(close.rx - 6) < 1e-9 && Math.abs(close.ry - 12) < 1e-9);

// Preset filtering: a window line does not count toward Classic Warm White (roofline only)
const project2 = { ...project, lines: [line, { id: 'l2', kind: 'window', points: [{ x: 0, y: 0 }, { x: 0.2, y: 0 }] }] };
assert.equal(totalFeet(project2, classic), 50);
assert.equal(totalFeet(project2), 70);

// Mistletoe: warm white, and only it lets single bulbs be recolored
const mistletoe = getPreset('mistletoe');
assert.equal(mistletoe.customizableBulbs, true);
assert.deepEqual(mistletoe.bulbColors, ['#FFD9A0']);
const painted = { ...line, bulbColors: { 3: '#2E7DFF' } };
assert.equal(bulbColorFor(mistletoe, painted, 3), '#2E7DFF');
assert.equal(bulbColorFor(mistletoe, painted, 4), '#FFD9A0');
assert.equal(bulbColorFor(getPreset('candy-cane'), painted, 3), '#FFD9A0'); // other presets ignore paint (odd index = white)
// Tapping finds the nearest bulb: 10 px/ft, 15" spacing => bulb 3 at 3 x 12.5px = x 37.5px (0.0375)
assert.deepEqual(nearestBulb(project, mistletoe, 15, { x: 0.038, y: 0.002 }), { lineId: 'l1', index: 3 });
assert.equal(nearestBulb(project, mistletoe, 15, { x: 0.3, y: 0.5 }), null); // far from any bulb
assert.equal(nearestBulb({ ...project, calibration: null }, mistletoe, 15, { x: 0.038, y: 0 }), null);

console.log('shared tests: all passed');

// Takedown / reinstall: seasonal-only flat fee; price lists saved before it existed read as 0
const withTd = { profiles: [{ ...std, seasonal: { ...std.seasonal, takedownReinstallFee: 200 } }] };
const td = computeEstimate(project, classic, withTd, opts);
assert.equal(td.total, 575); // 375 + 200
assert.ok(td.lines.some((l) => l.label === 'Takedown / reinstall' && l.amount === 200));
assert.equal(computeEstimate(project, classic, withTd, { ...opts, installType: 'permanent' }).total, 1250); // not on permanent
const legacyCard = { ...std.seasonal }; delete legacyCard.takedownReinstallFee;
const v = validatePricingSettings({ profiles: [{ ...std, seasonal: legacyCard, permanent: { ...std.permanent, takedownReinstallFee: 99 } }] });
assert.equal(v.settings.profiles[0].seasonal.takedownReinstallFee, 0);
assert.equal(v.settings.profiles[0].permanent.takedownReinstallFee, 0);
assert.equal(validatePricingSettings({ profiles: [{ ...std, seasonal: { ...std.seasonal, takedownReinstallFee: -5 } }] }).error?.includes('Takedown'), true);
console.log('takedown tests: all passed');
