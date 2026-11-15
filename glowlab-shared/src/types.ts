export interface Point { x: number; y: number; } // normalized 0..1 per axis
export interface ImageSize { width: number; height: number; }
export type LineKind = 'roofline' | 'ridge' | 'gutter' | 'window' | 'door' | 'pathway' | 'tree' | 'outline';
export interface TracedLine {
  id: string; kind: LineKind; points: Point[];
  /** Per-bulb color picks, keyed by bulb index along the line (only used by presets with customizableBulbs). */
  bulbColors?: Record<string, string>;
}
export interface Calibration { a: Point; b: Point; realFeet: number; }
export type BulbSize = 'C9' | 'C7' | 'mini';
export interface Preset {
  id: string; name: string; description: string;
  bulbColors: string[]; bulbSize: BulbSize;
  appliesTo: LineKind[]; icicle: boolean; icicleDropInches?: number;
  includesWreath?: boolean; includesPathway?: boolean;
  /** When true, individual bulbs can be recolored in the designer (stored per line in bulbColors). */
  customizableBulbs?: boolean;
}
/** Seasonal = strung each holiday season, then taken down. Permanent = year-round LED track. */
export type InstallType = 'seasonal' | 'permanent';
/** Prices for one install type (seasonal or permanent). */
export interface RateCard {
  ratePerFoot: number; secondStoryMultiplier: number; steepRoofFee: number;
  wreathPrice: number; pathwayStakePrice: number; treeWrapPrice: number; timerPrice: number;
  /** Seasonal only: flat takedown / reinstall charge added to the quote (0 = not shown). Always 0 on permanent. */
  takedownReinstallFee: number;
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
export type EstimateLineKind = 'lighting' | 'addon' | 'takedown' | 'fee';
export interface EstimateLine { label: string; detail: string; amount: number; kind?: EstimateLineKind; }
export interface EstimateBreakdown {
  lines: EstimateLine[]; bulbCount: number; clipCount: number; totalFeet: number;
  subtotal: number; total: number; depositDue: number;
}
export interface Project {
  id: string; clientName: string; address: string;
  photoDataUrl: string | null; imageWidth: number; imageHeight: number;
  /** Small copy of the photo (a few hundred px wide) shown on the project list. */
  thumbDataUrl?: string | null;
  /** Set on list results, where photoDataUrl is left out: whether the project has a photo. */
  hasPhoto?: boolean;
  calibration: Calibration | null; lines: TracedLine[]; presetId: string;
  estimateOptions: EstimateOptions; createdAt: string; updatedAt: string;
  /** 'quote' until the customer signs the contract, then 'won' (a closed deal). */
  status?: ProjectStatus;
  /** The signed contract: a snapshot of the price and terms at signing. Null while it's a quote. */
  contract?: SignedContract | null;
  /** The customer's drawn signature (PNG data URL). Only on single-project results, never in the list. */
  signatureDataUrl?: string | null;
}
export type ProjectStatus = 'quote' | 'won';
/**
 * Everything the customer agreed to, frozen at the moment of signing, so later price-list
 * or terms changes never alter a signed contract.
 */
export interface SignedContract {
  signedAt: string;
  customerName: string; customerPhone: string; customerEmail: string;
  businessName: string;
  clientName: string; address: string;
  presetName: string; installType: InstallType; bulbSpacingInches: number;
  /** The estimate from the design, kept for reference (line items). */
  estimate: EstimateBreakdown;
  /** The price the customer signed for (can differ from the estimate). Missing on contracts signed before this existed: use contractAmounts(). */
  contractTotal?: number;
  /** Deposit due at signing. Missing on older contracts: use contractAmounts(). */
  depositDue?: number;
  /** Takedown / reinstall fee added on top of the contract price (0 or missing = none). */
  takedownFee?: number;
  /** Balance due on completion (total minus deposit). */
  balanceDue: number;
  terms: string;
  /** Audit trail for the electronic signature. */
  signerIp: string; signerUserAgent: string;
}
/** What the customer fills in on the signing screen. */
export interface SignContractInput {
  customerName: string; customerPhone: string; customerEmail: string;
  signatureDataUrl: string; agreed: boolean;
  /** The price the customer signs for. Defaults to the estimate total. */
  contractTotal?: number;
  /** Deposit due at signing. Defaults to 50% of the contract price. */
  depositDue?: number;
  /** Feet of lighting on the contract (defaults to the traced footage). Re-prices the lighting line. */
  feet?: number;
  /** Bulb count shown on the contract (defaults to the design's count). */
  bulbCount?: number;
  /** Whether the takedown / reinstall line is on the contract, and its amount. Defaults to the price list. */
  takedownIncluded?: boolean;
  takedownAmount?: number;
}
export interface PublicUser { id: string; name: string; email: string; }
export interface BulbPosition { point: Point; angleDeg: number; index: number; }
export const DEFAULT_ESTIMATE_OPTIONS: EstimateOptions = {
  stories: 1, steepRoof: false, installType: 'seasonal', pricingProfileId: null, ratePerFoot: null,
  addOns: { wreaths: 0, pathwayStakes: 0, treeWraps: 0, timers: 0 },
};
