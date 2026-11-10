import type { EstimateBreakdown, EstimateLine, EstimateOptions, PricingSettings, Preset, Project } from './types';
import { totalFeet } from './geometry';

export function round2(n: number): number { return Math.round((n + Number.EPSILON) * 100) / 100; }
export function money(n: number): string { return `$${round2(n).toFixed(2)}`; }

/**
 * Itemized estimate. Per-foot charge = totalFeet (preset-applicable lines only)
 * x baseRatePerFoot, x purchaseMultiplier when model='purchase',
 * x secondStoryMultiplier when stories=2. Add-ons and the flat steep-roof fee
 * are added after multipliers. Deposit = 50% of total.
 */
export function computeEstimate(
  project: Pick<Project, 'lines' | 'calibration' | 'imageWidth' | 'imageHeight'>,
  preset: Preset,
  settings: PricingSettings,
  options: EstimateOptions,
): EstimateBreakdown {
  const feetRaw = totalFeet(project, preset);
  const feet = round2(feetRaw);
  const bulbCount = feetRaw > 0 ? Math.ceil((feetRaw * 12) / preset.spacingInches) : 0;
  const lines: EstimateLine[] = [];

  let perFoot = feetRaw * settings.baseRatePerFoot;
  const multDetail: string[] = [`${feet} ft × ${money(settings.baseRatePerFoot)}/ft`];
  if (options.model === 'purchase') { perFoot *= settings.purchaseMultiplier; multDetail.push(`purchase ×${settings.purchaseMultiplier}`); }
  else multDetail.push('rental (install + takedown included)');
  if (options.stories === 2) { perFoot *= settings.secondStoryMultiplier; multDetail.push(`2nd story ×${settings.secondStoryMultiplier}`); }
  perFoot = round2(perFoot);
  if (feet > 0) lines.push({ label: `${preset.name} lighting (${preset.bulbSize})`, detail: multDetail.join(', '), amount: perFoot });

  const add = (count: number, unit: number, label: string) => {
    if (count > 0) lines.push({ label, detail: `${count} × ${money(unit)}`, amount: round2(count * unit) });
  };
  add(options.addOns.wreaths, settings.wreathPrice, 'Wreath');
  add(options.addOns.pathwayStakes, settings.pathwayStakePrice, 'Pathway stake light');
  add(options.addOns.treeWraps, settings.treeWrapPrice, 'Tree wrap');
  add(options.addOns.timers, settings.timerPrice, 'Timer');
  if (options.steepRoof) lines.push({ label: 'Steep / difficult roof fee', detail: 'flat fee', amount: round2(settings.steepRoofFee) });

  const subtotal = round2(lines.reduce((s, l) => s + l.amount, 0));
  const total = subtotal;
  return { lines, bulbCount, clipCount: bulbCount, totalFeet: feet, subtotal, total, depositDue: round2(total * 0.5) };
}
