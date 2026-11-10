import type { Preset, PricingProfile, PricingSettings, RateCard, TracedLine } from './types';

export const WARM_WHITE = '#FFD9A0';
export const COOL_WHITE = '#EAF4FF';
export const RED = '#FF2D2D';

export const PRESETS: Preset[] = [
  {
    id: 'classic-warm-white', name: 'Classic Warm White',
    description: 'C9 warm white bulbs along the roofline only. The timeless look.',
    bulbColors: [WARM_WHITE], bulbSize: 'C9',
    appliesTo: ['roofline'], icicle: false,
  },
  {
    id: 'full-roofline', name: 'Full Roofline',
    description: 'Warm white C9s on roofline, ridges and gutters — the complete roof outline.',
    bulbColors: [WARM_WHITE], bulbSize: 'C9',
    appliesTo: ['roofline', 'ridge', 'gutter'], icicle: false,
  },
  {
    id: 'multicolor-nostalgia', name: 'Multicolor Nostalgia',
    description: 'Repeating red, green, blue, gold and warm white C9s — classic childhood Christmas.',
    bulbColors: ['#FF2D2D', '#2ECC71', '#2E7DFF', '#FFC93C', WARM_WHITE], bulbSize: 'C9',
    appliesTo: ['roofline', 'ridge', 'gutter'], icicle: false,
  },
  {
    id: 'candy-cane', name: 'Candy Cane',
    description: 'Alternating red and warm white C9s along the roofline.',
    bulbColors: [RED, WARM_WHITE], bulbSize: 'C9',
    appliesTo: ['roofline', 'ridge', 'gutter'], icicle: false,
  },
  {
    id: 'icicles-roofline', name: 'Icicles + Roofline',
    description: 'Warm white roofline plus cool white icicle drops hanging from the gutters.',
    bulbColors: [WARM_WHITE], bulbSize: 'C9',
    appliesTo: ['roofline', 'gutter'], icicle: true, icicleDropInches: 18,
  },
  {
    id: 'elegant-full-home', name: 'Elegant Full Home',
    description: 'Warm white roofline, window and door outlines, plus a wreath and pathway stake lights (add them in the estimate add-ons).',
    bulbColors: [WARM_WHITE], bulbSize: 'C9',
    appliesTo: ['roofline', 'ridge', 'gutter', 'window', 'door', 'pathway', 'outline'],
    icicle: false, includesWreath: true, includesPathway: true,
  },
  {
    id: 'winter-white', name: 'Winter White',
    description: 'All cool white — crisp, modern, snowy. Roofline, windows, doors and trees.',
    bulbColors: [COOL_WHITE], bulbSize: 'C9',
    appliesTo: ['roofline', 'ridge', 'gutter', 'window', 'door', 'tree', 'outline'], icicle: false,
  },
  {
    id: 'mistletoe', name: 'Mistletoe',
    description: 'Warm white C9s you can personalize — use Paint bulbs to change the color of any single bulb.',
    bulbColors: [WARM_WHITE], bulbSize: 'C9',
    appliesTo: ['roofline', 'ridge', 'gutter', 'window', 'door', 'outline'], icicle: false,
    customizableBulbs: true,
  },
];

/** Colors offered by the Paint bulbs tool (Mistletoe). */
export const PAINT_COLORS: { name: string; color: string }[] = [
  { name: 'Warm white', color: WARM_WHITE },
  { name: 'Cool white', color: COOL_WHITE },
  { name: 'Red', color: RED },
  { name: 'Green', color: '#2ECC71' },
  { name: 'Blue', color: '#2E7DFF' },
  { name: 'Gold', color: '#FFC93C' },
  { name: 'Purple', color: '#A45CFF' },
  { name: 'Pink', color: '#FF6FB5' },
];

/** The color a bulb is drawn in: a painted color (customizable presets only), else the preset's repeating pattern. */
export function bulbColorFor(preset: Preset, line: TracedLine, index: number): string {
  const painted = preset.customizableBulbs ? line.bulbColors?.[String(index)] : undefined;
  return painted ?? preset.bulbColors[index % preset.bulbColors.length];
}

export function getPreset(id: string): Preset | undefined { return PRESETS.find((p) => p.id === id); }

export const DEFAULT_BULB_SPACING_INCHES = 15;

export const DEFAULT_SEASONAL_RATES: RateCard = {
  ratePerFoot: 7.5, secondStoryMultiplier: 1.25, steepRoofFee: 150,
  wreathPrice: 85, pathwayStakePrice: 18, treeWrapPrice: 120, timerPrice: 45,
  takedownReinstallFee: 0,
};
export const DEFAULT_PERMANENT_RATES: RateCard = {
  ratePerFoot: 25, secondStoryMultiplier: 1.25, steepRoofFee: 250,
  wreathPrice: 85, pathwayStakePrice: 18, treeWrapPrice: 120, timerPrice: 0,
  takedownReinstallFee: 0,
};

/** A fresh price list with the default prices. */
export function newPricingProfile(id: string, name: string): PricingProfile {
  return {
    id, name, bulbSpacingInches: DEFAULT_BULB_SPACING_INCHES,
    seasonal: { ...DEFAULT_SEASONAL_RATES }, permanent: { ...DEFAULT_PERMANENT_RATES },
  };
}

export const DEFAULT_PRICING: PricingSettings = { profiles: [newPricingProfile('standard', 'Standard')] };
