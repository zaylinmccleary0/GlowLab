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
const reg = await req('/api/auth/register', { method: 'POST', body: { name: 'Test Lighting Co', email, password: 'test-pass-123' } });
check('register returns a user', reg.user.email, email);
const login = await req('/api/auth/login', { method: 'POST', body: { email, password: 'test-pass-123' } });
const token = login.token;
check('login returns a token', typeof token, 'string');

// 2. presets (7, from @glowlab/shared)
const { presets, total } = await req('/api/presets', { token });
check('preset count', total, 7);
check('preset ids', presets.map((p) => p.id), ['classic-warm-white', 'full-roofline', 'multicolor-nostalgia', 'candy-cane', 'icicles-roofline', 'elegant-full-home', 'winter-white']);
check('candy cane pattern', presets.find((p) => p.id === 'candy-cane').bulbColors, ['#FF2D2D', '#FFD9A0']);

// 3. settings: one default "Standard" price list on register, then PUT round-trips
const card = (rate, steep, timer) => ({ ratePerFoot: rate, secondStoryMultiplier: 1.25, steepRoofFee: steep, wreathPrice: 85, pathwayStakePrice: 18, treeWrapPrice: 120, timerPrice: timer });
const DEFAULTS = { profiles: [{ id: 'standard', name: 'Standard', bulbSpacingInches: 15, seasonal: card(7.5, 150, 45), permanent: card(25, 250, 0) }] };
const s0 = await req('/api/settings', { token });
check('default pricing on register', s0.settings, DEFAULTS);
const premium = { id: 'premium', name: 'Premium', bulbSpacingInches: 12, seasonal: card(10, 150, 45), permanent: card(30, 250, 0) };
const s1 = await req('/api/settings', { method: 'PUT', token, body: { profiles: [DEFAULTS.profiles[0], premium] } });
check('PUT settings saves a second price list', s1.settings.profiles.map((p) => p.name), ['Standard', 'Premium']);
let badRejected = false;
try { await req('/api/settings', { method: 'PUT', token, body: { profiles: [{ ...premium, seasonal: { ...premium.seasonal, ratePerFoot: '' } }] } }); } catch { badRejected = true; }
check('blank price rejected', badRejected, true);
const s2 = await req('/api/settings', { token });
check('price lists persisted', s2.settings.profiles.length, 2);

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
    estimateOptions: { stories: 1, steepRoof: false, installType: 'seasonal', pricingProfileId: null, ratePerFoot: null, addOns: { wreaths: 0, pathwayStakes: 0, treeWraps: 0, timers: 0 } },
  },
});
check('project created with client', project.clientName, 'Smoke Test House');
const list = await req('/api/projects', { token });
check('project list count', list.projects.length, 1);

// 5. estimate, hand-computed with the default "Standard" list (seasonal $7.50/ft, bulbs every 15"):
//    50 ft x $7.50/ft = $375.00 ; bulbs = ceil(50 x 12 / 15) = 40 ; deposit 50% = $187.50
const { estimate } = await req(`/api/projects/${project.id}/estimate`, { method: 'POST', token, body: {} });
check('estimate totalFeet', estimate.totalFeet, 50);
check('estimate bulbCount', estimate.bulbCount, 40);
check('estimate clipCount', estimate.clipCount, 40);
check('estimate total', estimate.total, 375);
check('estimate depositDue', estimate.depositDue, 187.5);
check('estimate line amount', estimate.lines[0].amount, 375);
// Permanent on the Premium list: 50 x $30 = $1,500 ; 12" spacing => 50 bulbs
const { estimate: e2 } = await req(`/api/projects/${project.id}/estimate`, { method: 'POST', token, body: { options: { ...project.estimateOptions, installType: 'permanent', pricingProfileId: 'premium' } } });
check('premium permanent total', e2.total, 1500);
check('premium bulb count', e2.bulbCount, 50);
// Custom rate for this job: 50 x $9 = $450
const { estimate: e3 } = await req(`/api/projects/${project.id}/estimate`, { method: 'POST', token, body: { options: { ...project.estimateOptions, ratePerFoot: 9 } } });
check('custom rate total', e3.total, 450);

// 6. bad preset is rejected
let rejected = false;
try {
  await req('/api/projects', { method: 'POST', token, body: { clientName: 'Bad', presetId: 'nope', lines: [] } });
} catch { rejected = true; }
check('unknown presetId rejected', rejected, true);

console.log(failures === 0 ? '\nSMOKE TEST: all checks passed' : `\nSMOKE TEST: ${failures} check(s) FAILED`);
process.exit(failures === 0 ? 0 : 1);
