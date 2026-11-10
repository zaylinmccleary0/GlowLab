# GlowLab — holiday exterior lighting estimates

Photograph a house, trace the roofline, tap a light design, and hand the
homeowner a glowing mockup with an itemized price — all in one visit.

Four packages, one product, modeled on the ParLab / MealPrep builds:

| Package | What it is | Run / build |
|---|---|---|
| `glowlab-shared` | Shared TypeScript: types, 7 presets, geometry (calibration math), bulb placement, pricing | `npm install && npm run build && npm test` |
| `glowlab-server` | API: single-business auth, projects, presets, pricing settings, server-side estimates (Express + Turso/libSQL + JWT) | `npm install && npm run build && npm start` |
| `glowlab-web` | Web app: photo Designer with glowing preset rendering, estimate panel, printable quote (served by the server) | `npm install && npm run build` |
| `glowlab-mobile` | Phone app (Expo / React Native), same API | `npx expo start` |

Single-business tool for now — register one account and every project,
photo and price is yours. No teams, no billing.

## How the estimator works

1. **Photo** — upload a house photo (or use the built-in Demo House). The
   photo's real pixel width/height are stored with the project.
2. **Calibrate** — tap the two ends of something whose real width you know,
   then tell GlowLab what it measured: **front door = 3 ft**, **single garage
   door = 9 ft**, or a custom number. That gives pixels-per-foot
   (`calibrationPixelsPerFoot`). Without calibration, lengths read 0 — on
   purpose, so a quote never goes out on a guess.
3. **Trace** — tap points along the roofline, ridges, gutters, windows, door,
   pathway, trees. Each line's length is computed **in pixel space** using the
   photo's real dimensions (points are stored normalized 0..1 per axis, so
   normalized math would distort distances on non-square photos).
4. **Preset** — pick a design (below). Bulbs are rendered glowing along every
   traced line the preset applies to, one bulb at the start of each spacing
   interval, colored by repeating pattern index. Night Mode dims the photo so
   the glow reads like evening.
5. **Estimate** — footage × your rate, with purchase / second-story
   multipliers, a flat steep-roof fee, and per-item add-ons (wreaths, pathway
   stakes, tree wraps, timers). Itemized lines, total, and a 50% deposit.
   Web, mobile and server all run the same `@glowlab/shared` math, so the
   numbers always agree. The Quote view is a clean printable summary with the
   mockup image.

### The 7 presets

| Preset | Look | Applies to |
|---|---|---|
| Classic Warm White | C9 warm white `#FFD9A0`, 12″ spacing | roofline |
| Full Roofline | C9 warm white | roofline + ridge + gutter |
| Multicolor Nostalgia | C9 repeating red / green / blue / gold / warm white | roofline + ridge + gutter |
| Candy Cane | C9 alternating red / warm white | roofline + ridge + gutter |
| Icicles + Roofline | C9 warm white roofline + cool white icicle drops (18″) on gutters | roofline + gutter |
| Elegant Full Home | C9 warm white; suggests wreath + pathway add-ons | roofline + ridge + gutter + window + door + pathway + outline |
| Winter White | C9 all cool white `#EAF4FF` | roofline + ridge + gutter + window + door + tree + outline |

### Default pricing (`DEFAULT_PRICING`, editable in Settings)

Base rate **$7.50/ft** (rental — install + takedown included), purchase
multiplier **1.6×**, second-story multiplier **1.25×**, steep-roof fee
**$150 flat**, wreath **$85**, pathway stake **$18**, tree wrap **$120**,
timer **$45**. Deposit = 50% of total.

## Quick start (local)

```bash
npm install          # shared, server and web are one npm workspace
npm run build        # shared -> web -> server; web dist/ is served by the server
npm test             # shared tests
npm start            # API + web app on http://localhost:4200
```

Open http://localhost:4200 → **Create account** → create a project → upload a
photo → calibrate on the front door → trace → pick a preset → quote.

Verify the whole flow end-to-end (server must be running on a fresh DB):

```bash
PORT=4300 DATABASE_PATH=/tmp/glowlab-smoke.db node glowlab-server/dist/index.js  # terminal 1
node smoke-test.mjs                                                              # terminal 2
```

## Deploying

- **Web + API:** Vercel (static web app + one serverless function) with a Turso
  database. See [DEPLOY.md](DEPLOY.md) for the steps and environment variables.
  Locally, with no Turso variables set, the server uses a SQLite file at
  `glowlab-server/data/glowlab.db` (override with `DATABASE_PATH`).
- **Phone app:** `npx expo start` to test in Expo Go, then EAS Build
  (`eas build --platform ios`) and `eas submit`. Requires Apple Developer
  enrollment ($99/yr). Point `EXPO_PUBLIC_API_URL` at your server URL.

## Launch checklist

- [ ] Deploy to Vercel + Turso (see DEPLOY.md) with a real `JWT_SECRET`
- [ ] Register your business account on the production server
- [ ] Set your real $/ft rate and add-on prices in Settings before quoting
- [ ] Set `EXPO_PUBLIC_API_URL` to the production server for mobile builds
- [ ] Apple Developer enrollment ($99/yr) for an App Store / TestFlight build
- [ ] App icon + splash screen for the mobile app (Expo defaults for now)
- [ ] Test the designer on 3–4 real house photos (daylight + dusk) before the first client visit

## Honest gaps (v1)

- **Manual tracing only — no AI auto-detect.** You tap the roofline yourself;
  it's ~30 seconds on site and accurate at any angle, but auto-detection is
  the obvious v2.
- **Photos are stored as data URLs in the database.** Simple and portable; the web
  app shrinks uploads to 1600px and the API caps requests at 4 MB (Vercel's limit
  is 4.5 MB). Object storage is a v2 move.
- **No Stripe billing** — this is a single-business tool, not a SaaS. Anyone
  who finds the URL can create an account (each sees only their own projects).
- **One calibration segment per project.** Re-calibrating replaces it. Photos
  taken at an angle still carry perspective error — shoot straight-on from
  the street for the tightest footage.
- Icicle drops render on **gutter** lines only, every other bulb position.

## Verification (Nov 9, 2026)

- `glowlab-shared`: `tsc` clean; **unit tests pass** — geometry hand-checks
  (1000×1000 image, calibration 100px = 10 ft ⇒ 10 px/ft; a 500px roofline =
  **50 ft**, including a non-square 2000×500 per-axis check), bulb convention
  (one bulb at the start of each spacing interval, far endpoint excluded ⇒
  **50 bulbs** at 12″ spacing on 50 ft, matching `ceil(50×12/12)`), candy-cane
  color alternation by index, and two full pricing cases computed by hand.
- `glowlab-server`: `tsc` clean; boots on a fresh DB (port 4300 in testing);
  also verified serving the built web app at `/`.
- `glowlab-web`: `tsc -b && vite build` clean.
- `glowlab-mobile`: `npm install` + `tsc --noEmit` clean.
- `smoke-test.mjs`: **17/17 checks pass** — register → login → **7 presets**
  (ids + candy-cane colors) → settings defaults → PUT settings round-trip →
  create project with the shared test geometry (1000×1000, calibration
  100px = 10 ft, roofline 500px) → server estimate asserts
  **totalFeet = 50, bulbCount = 50, clipCount = 50** and the hand-computed
  money: 50 ft × $7.50/ft rental = **total $375.00, deposit $187.50** →
  unknown presetId rejected.
- Second hand-computed pricing case (shared tests): purchase + 2nd story +
  steep + add-ons — 50 × $7.50 × 1.6 × 1.25 = $750.00, plus wreath $85 +
  10 stakes $180 + tree wrap $120 + timer $45 = $430, plus steep fee $150 ⇒
  **total $1,330.00, deposit $665.00** ✓.

Each package has its own README with more detail.
