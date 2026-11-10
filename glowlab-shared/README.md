# @glowlab/shared

Shared TypeScript for GlowLab: types, the 7 presets, geometry and pricing.

- **Geometry:** points are normalized (0..1 per axis), so distances are always
  computed in pixel space using the photo's real width/height, then divided by
  the calibration's pixels-per-foot. Never measure in normalized space.
- **Bulb convention:** one bulb at the start of each spacing interval, far
  endpoint excluded — rendered count equals `ceil(feet * 12 / spacingInches)`,
  matching `computeEstimate`'s bulb/clip counts.
- **Pricing:** see `pricing.ts`. Deposit is 50% of total.

`npm install && npm run build && npm test`
