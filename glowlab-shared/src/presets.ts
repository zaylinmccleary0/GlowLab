import type { Preset, PricingProfile, PricingSettings, RateCard } from './types';

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
];

export function getPreset(id: string): Preset | undefined { return PRESETS.find((p) => p.id === id); }

export const DEFAULT_BULB_SPACING_INCHES = 15;

export const DEFAULT_SEASONAL_RATES: RateCard = {
  ratePerFoot: 7.5, secondStoryMultiplier: 1.25, steepRoofFee: 150,
  wreathPrice: 85, pathwayStakePrice: 18, treeWrapPrice: 120, timerPrice: 45,
};
export const DEFAULT_PERMANENT_RATES: RateCard = {
  ratePerFoot: 25, secondStoryMultiplier: 1.25, steepRoofFee: 250,
  wreathPrice: 85, pathwayStakePrice: 18, treeWrapPrice: 120, timerPrice: 0,
};

/** A fresh price list with the default prices. */
export function newPricingProfile(id: string, name: string): PricingProfile {
  return {
    id, name, bulbSpacingInches: DEFAULT_BULB_SPACING_INCHES,
    seasonal: { ...DEFAULT_SEASONAL_RATES }, permanent: { ...DEFAULT_PERMANENT_RATES },
  };
}

export const DEFAULT_PRICING: PricingSettings = { profiles: [newPricingProfile('standard', 'Standard')] };
