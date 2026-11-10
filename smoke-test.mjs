// End-to-end smoke test for the GlowLab API. Boots against a running server.
// Usage: PORT=4300 DATABASE_PATH=/tmp/glowlab-smoke.db node glowlab-server/dist/index.js  (terminal 1)
//        node smoke-test.mjs   (terminal 2, GLOWLAB_API defaults to http://localhost:4300)
// Asserts: register -> login -> 7 presets -> settings PUT round-trip -> project
// with hand-checkable geometry -> server estimate matches hand-computed money.
const BASE = process.env.GLOWLAB_API ?? 'http://localhost:4300';

let failures = 0;
function check(label, actual, expected) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}: got ${JSON.stringify(actual)}${ok ? '' : `, expected ${JSON.stringify(expected)}`}`);
  if (!ok) failures++;
}

async function req(path, { method = 'GET', token, body } = {}) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`${method} ${path} -> ${res.status}: ${data.error ?? 'unknown error'}`);
  return data;
}

const email = `smoke-${Date.now()}@example.com`;

// 1. register + login
const reg = await req('/api/auth/register', { method: 'POST', body: { name: 'Caden', email, password: 'test-pass-123' } });
check('register returns a user', reg.user.email, email);
const login = await req('/api/auth/login', { method: 'POST', body: { email, password: 'test-pass-123' } });
const token = login.token;
check('login returns a token', typeof token, 'string');

// 2. presets (7, from @glowlab/shared)
const { presets, total } = await req('/api/presets', { token });
check('preset count', total, 7);
check('preset ids', presets.map((p) => p.id), ['classic-warm-white', 'full-roofline', 'multicolor-nostalgia', 'candy-cane', 'icicles-roofline', 'elegant-full-home', 'winter-white']);
check('candy cane pattern', presets.find((p) => p.id === 'candy-cane').bulbColors, ['#FF2D2D', '#FFD9A0']);

// 3. settings: defaults on register, then PUT round-trip
const DEFAULTS = { baseRatePerFoot: 7.5, purchaseMultiplier: 1.6, secondStoryMultiplier: 1.25, steepRoofFee: 150, wreathPrice: 85, pathwayStakePrice: 18, treeWrapPrice: 120, timerPrice: 45 };
const s0 = await req('/api/settings', { token });
check('default pricing on register', s0.settings, DEFAULTS);
const s1 = await req('/api/settings', { method: 'PUT', token, body: { ...DEFAULTS, timerPrice: 50 } });
check('PUT settings timer price', s1.settings.timerPrice, 50);
await req('/api/settings', { method: 'PUT', token, body: DEFAULTS }); // restore defaults for the hand-computed estimate below
const s2 = await req('/api/settings', { token });
check('settings restored to defaults', s2.settings, DEFAULTS);

// 4. project with known geometry:
//    image 1000x1000; calibration (0,0)->(0.1,0) = 100px = 10 ft => 10 px/ft
//    one roofline (0,0)->(0.5,0) = 500px = 50 ft
const { project } = await req('/api/projects', {
  method: 'POST', token,
  body: {
    clientName: 'Smoke Test House', address: '1 Test Ln', photoDataUrl: null,
    imageWidth: 1000, imageHeight: 1000,
    calibration: { a: { x: 0, y: 0 }, b: { x: 0.1, y: 0 }, realFeet: 10 },
    lines: [{ id: 'l1', kind: 'roofline', points: [{ x: 0, y: 0 }, { x: 0.5, y: 0 }] }],
    presetId: 'classic-warm-white',
    estimateOptions: { stories: 1, steepRoof: false, model: 'rental', addOns: { wreaths: 0, pathwayStakes: 0, treeWraps: 0, timers: 0 } },
  },
});
check('project created with client', project.clientName, 'Smoke Test House');
const list = await req('/api/projects', { token });
check('project list count', list.projects.length, 1);

// 5. estimate, hand-computed with DEFAULT_PRICING:
//    50 ft x $7.50/ft rental = $375.00 ; bulbs = ceil(50 x 12 / 12) = 50 ; deposit 50% = $187.50
const { estimate } = await req(`/api/projects/${project.id}/estimate`, { method: 'POST', token, body: {} });
check('estimate totalFeet', estimate.totalFeet, 50);
check('estimate bulbCount', estimate.bulbCount, 50);
check('estimate clipCount', estimate.clipCount, 50);
check('estimate total', estimate.total, 375);
check('estimate depositDue', estimate.depositDue, 187.5);
check('estimate line amount', estimate.lines[0].amount, 375);

// 6. bad preset is rejected
let rejected = false;
try {
  await req('/api/projects', { method: 'POST', token, body: { clientName: 'Bad', presetId: 'nope', lines: [] } });
} catch { rejected = true; }
check('unknown presetId rejected', rejected, true);

console.log(failures === 0 ? '\nSMOKE TEST: all checks passed' : `\nSMOKE TEST: ${failures} check(s) FAILED`);
process.exit(failures === 0 ? 0 : 1);
