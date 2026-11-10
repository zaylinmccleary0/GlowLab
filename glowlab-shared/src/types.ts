export interface Point { x: number; y: number; } // normalized 0..1 per axis
export interface ImageSize { width: number; height: number; }
export type LineKind = 'roofline' | 'ridge' | 'gutter' | 'window' | 'door' | 'pathway' | 'tree' | 'outline';
export interface TracedLine { id: string; kind: LineKind; points: Point[]; }
export interface Calibration { a: Point; b: Point; realFeet: number; }
export type BulbSize = 'C9' | 'C7' | 'mini';
export interface Preset {
  id: string; name: string; description: string;
  bulbColors: string[]; bulbSize: BulbSize;
  appliesTo: LineKind[]; icicle: boolean; icicleDropInches?: number;
  includesWreath?: boolean; includesPathway?: boolean;
}
/** Seasonal = strung each holiday season, then taken down. Permanent = year-round LED track. */
export type InstallType = 'seasonal' | 'permanent';
/** Prices for one install type (seasonal or permanent). */
export interface RateCard {
  ratePerFoot: number; secondStoryMultiplier: number; steepRoofFee: number;
  wreathPrice: number; pathwayStakePrice: number; treeWrapPrice: number; timerPrice: number;
}
/** A saved, named price list: its own seasonal and permanent prices and bulb spacing. */
export interface PricingProfile {
  id: string; name: string;
  /** Distance between bulbs, used for the drawing and the bulb count. */
  bulbSpacingInches: number;
  seasonal: RateCard; permanent: RateCard;
}
export const MAX_PRICING_PROFILES = 3;
/** All of a business's pricing: 1 to MAX_PRICING_PROFILES price lists; the first is the default. */
export interface PricingSettings { profiles: PricingProfile[]; }
export interface EstimateAddOns { wreaths: number; pathwayStakes: number; treeWraps: number; timers: number; }
export interface EstimateOptions {
  stories: 1 | 2; steepRoof: boolean; installType: InstallType;
  /** Which saved price list this job uses; null (or a deleted one) means the first. */
  pricingProfileId: string | null;
  /** Custom $/ft for this job only; null uses the price list's rate for the install type. */
  ratePerFoot: number | null;
  addOns: EstimateAddOns;
}
export interface EstimateLine { label: string; detail: string; amount: number; }
export interface EstimateBreakdown {
  lines: EstimateLine[]; bulbCount: number; clipCount: number; totalFeet: number;
  subtotal: number; total: number; depositDue: number;
}
export interface Project {
  id: string; clientName: string; address: string;
  photoDataUrl: string | null; imageWidth: number; imageHeight: number;
  calibration: Calibration | null; lines: TracedLine[]; presetId: string;
  estimateOptions: EstimateOptions; createdAt: string; updatedAt: string;
}
export interface PublicUser { id: string; name: string; email: string; }
export interface BulbPosition { point: Point; angleDeg: number; index: number; }
export const DEFAULT_ESTIMATE_OPTIONS: EstimateOptions = {
  stories: 1, steepRoof: false, installType: 'seasonal', pricingProfileId: null, ratePerFoot: null,
  addOns: { wreaths: 0, pathwayStakes: 0, treeWraps: 0, timers: 0 },
};
