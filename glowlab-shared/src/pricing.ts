import type {
  EstimateBreakdown, EstimateLine, EstimateOptions, InstallType, PricingProfile, PricingSettings, Preset, Project, RateCard,
} from './types';
import { MAX_PRICING_PROFILES } from './types';
import { DEFAULT_PRICING } from './presets';
import { totalFeet } from './geometry';

export function round2(n: number): number { return Math.round((n + Number.EPSILON) * 100) / 100; }
export function money(n: number): string { return `$${round2(n).toFixed(2)}`; }

export const INSTALL_TYPE_LABELS: Record<InstallType, string> = { seasonal: 'Seasonal', permanent: 'Permanent' };

/** The fields of a rate card, in display order, with labels for settings screens. */
export const RATE_CARD_FIELDS: { key: keyof RateCard; label: string; hint: string }[] = [
  { key: 'ratePerFoot', label: 'Price per linear foot ($)', hint: 'Charged on every traced foot this design lights' },
  { key: 'secondStoryMultiplier', label: 'Second-story multiplier', hint: 'e.g. 1.25 = 25% more per foot on 2-story homes' },
  { key: 'steepRoofFee', label: 'Steep roof fee ($, flat)', hint: 'Added once for steep / difficult roofs' },
  { key: 'wreathPrice', label: 'Wreath ($ each)', hint: '' },
  { key: 'pathwayStakePrice', label: 'Pathway stake ($ each)', hint: '' },
  { key: 'treeWrapPrice', label: 'Tree wrap ($ each)', hint: '' },
  { key: 'timerPrice', label: 'Timer ($ each)', hint: '' },
];

/** Fills in anything missing from saved/legacy estimate options (e.g. the old rental/purchase `model`). */
export function normalizeEstimateOptions(raw: Partial<EstimateOptions> | null | undefined): EstimateOptions {
  const o = (raw ?? {}) as Partial<EstimateOptions>;
  const count = (v: unknown) => Math.max(0, Math.floor(Number(v) || 0));
  const r = o.ratePerFoot as unknown;
  const rate = r === null || r === undefined || r === '' ? null : Number(r);
  return {
    stories: o.stories === 2 ? 2 : 1,
    steepRoof: Boolean(o.steepRoof),
    installType: o.installType === 'permanent' ? 'permanent' : 'seasonal',
    pricingProfileId: typeof o.pricingProfileId === 'string' && o.pricingProfileId ? o.pricingProfileId : null,
    ratePerFoot: rate !== null && Number.isFinite(rate) && rate >= 0 ? rate : null,
    addOns: {
      wreaths: count(o.addOns?.wreaths),
      pathwayStakes: count(o.addOns?.pathwayStakes),
      treeWraps: count(o.addOns?.treeWraps),
      timers: count(o.addOns?.timers),
    },
  };
}

/** The price list a job uses: the one it picked, else the first (default). */
export function profileFor(settings: PricingSettings, options: Pick<EstimateOptions, 'pricingProfileId'>): PricingProfile {
  const profiles = settings.profiles.length ? settings.profiles : DEFAULT_PRICING.profiles;
  return profiles.find((p) => p.id === options.pricingProfileId) ?? profiles[0];
}

/** The rate card a job uses: its price list's seasonal or permanent prices. */
export function rateCardFor(settings: PricingSettings, options: Pick<EstimateOptions, 'pricingProfileId' | 'installType'>): RateCard {
  return profileFor(settings, options)[options.installType === 'permanent' ? 'permanent' : 'seasonal'];
}

/** $/ft actually charged: the job's custom rate when set, otherwise the rate card's. */
export function effectiveRatePerFoot(settings: PricingSettings, options: EstimateOptions): number {
  return options.ratePerFoot ?? rateCardFor(settings, options).ratePerFoot;
}

/** One bulb per spacing interval: ceil(feet x 12 / spacingInches). */
export function bulbCountFor(feet: number, spacingInches: number): number {
  return feet > 0 && spacingInches > 0 ? Math.ceil((feet * 12) / spacingInches - 1e-9) : 0;
}

/**
 * Checks pricing sent by a client. Returns the cleaned settings, or an error
 * message naming the first bad field.
 */
export function validatePricingSettings(raw: unknown): { settings?: PricingSettings; error?: string } {
  const profiles = (raw as { profiles?: unknown })?.profiles;
  if (!Array.isArray(profiles) || profiles.length < 1 || profiles.length > MAX_PRICING_PROFILES) {
    return { error: `Between 1 and ${MAX_PRICING_PROFILES} price lists are required` };
  }
  const out: PricingProfile[] = [];
  const ids = new Set<string>();
  for (const p of profiles as Record<string, unknown>[]) {
    const id = typeof p?.id === 'string' ? p.id.trim() : '';
    if (!id || id.length > 64 || ids.has(id)) return { error: 'Each price list needs a unique id' };
    ids.add(id);
    const name = typeof p.name === 'string' ? p.name.trim() : '';
    if (!name || name.length > 40) return { error: 'Each price list needs a name (up to 40 characters)' };
    const spacing = Number(p.bulbSpacingInches);
    if (!Number.isFinite(spacing) || spacing < 1 || spacing > 48) return { error: `${name}: bulb spacing must be between 1 and 48 inches` };
    const cards = {} as Record<InstallType, RateCard>;
    for (const type of ['seasonal', 'permanent'] as const) {
      const src = (p[type] ?? {}) as Record<string, unknown>;
      const card = {} as RateCard;
      for (const { key, label } of RATE_CARD_FIELDS) {
        const v = Number(src[key]);
        if (src[key] === '' || src[key] === null || !Number.isFinite(v) || v < 0) {
          return { error: `${name} (${INSTALL_TYPE_LABELS[type]}): ${label} must be a number, 0 or more` };
        }
        card[key] = v;
      }
      cards[type] = card;
    }
    out.push({ id, name, bulbSpacingInches: spacing, seasonal: cards.seasonal, permanent: cards.permanent });
  }
  return { settings: { profiles: out } };
}

/**
 * Itemized estimate. Uses the job's price list (else the first) and its
 * seasonal or permanent rate card. Per-foot charge = totalFeet
 * (preset-applicable lines only) x rate per foot (the job's custom rate when
 * set), x secondStoryMultiplier when stories=2. Add-ons and the flat
 * steep-roof fee come from the same rate card. Deposit = 50% of total.
 */
export function computeEstimate(
  project: Pick<Project, 'lines' | 'calibration' | 'imageWidth' | 'imageHeight'>,
  preset: Preset,
  settings: PricingSettings,
  rawOptions: EstimateOptions,
): EstimateBreakdown {
  const options = normalizeEstimateOptions(rawOptions);
  const profile = profileFor(settings, options);
  const card = rateCardFor(settings, options);
  const feetRaw = totalFeet(project, preset);
  const feet = round2(feetRaw);
  const bulbCount = bulbCountFor(feetRaw, profile.bulbSpacingInches);
  const lines: EstimateLine[] = [];

  const rate = effectiveRatePerFoot(settings, options);
  const permanent = options.installType === 'permanent';
  let perFoot = feetRaw * rate;
  const detail: string[] = [`${feet} ft × ${money(rate)}/ft`];
  if (options.ratePerFoot !== null) detail.push('custom rate');
  detail.push(permanent ? 'permanent LED track, stays up year-round' : 'seasonal (install + takedown included)');
  if (options.stories === 2) { perFoot *= card.secondStoryMultiplier; detail.push(`2nd story ×${card.secondStoryMultiplier}`); }
  perFoot = round2(perFoot);
  const what = permanent ? 'LED' : preset.bulbSize;
  if (feet > 0) lines.push({ label: `${preset.name} — ${INSTALL_TYPE_LABELS[options.installType]} lighting (${what})`, detail: detail.join(', '), amount: perFoot });

  const add = (count: number, unit: number, label: string) => {
    if (count > 0) lines.push({ label, detail: `${count} × ${money(unit)}`, amount: round2(count * unit) });
  };
  add(options.addOns.wreaths, card.wreathPrice, 'Wreath');
  add(options.addOns.pathwayStakes, card.pathwayStakePrice, 'Pathway stake light');
  add(options.addOns.treeWraps, card.treeWrapPrice, 'Tree wrap');
  add(options.addOns.timers, card.timerPrice, 'Timer');
  if (options.steepRoof) lines.push({ label: 'Steep / difficult roof fee', detail: 'flat fee', amount: round2(card.steepRoofFee) });

  const subtotal = round2(lines.reduce((s, l) => s + l.amount, 0));
  const total = subtotal;
  return { lines, bulbCount, clipCount: bulbCount, totalFeet: feet, subtotal, total, depositDue: round2(total * 0.5) };
}
