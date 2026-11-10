export interface Point { x: number; y: number; } // normalized 0..1 per axis
export interface ImageSize { width: number; height: number; }
export type LineKind = 'roofline' | 'ridge' | 'gutter' | 'window' | 'door' | 'pathway' | 'tree' | 'outline';
export interface TracedLine { id: string; kind: LineKind; points: Point[]; }
export interface Calibration { a: Point; b: Point; realFeet: number; }
export type BulbSize = 'C9' | 'C7' | 'mini';
export interface Preset {
  id: string; name: string; description: string;
  bulbColors: string[]; spacingInches: number; bulbSize: BulbSize;
  appliesTo: LineKind[]; icicle: boolean; icicleDropInches?: number;
  includesWreath?: boolean; includesPathway?: boolean;
}
export interface PricingSettings {
  baseRatePerFoot: number; purchaseMultiplier: number; secondStoryMultiplier: number;
  steepRoofFee: number; wreathPrice: number; pathwayStakePrice: number; treeWrapPrice: number; timerPrice: number;
}
export interface EstimateAddOns { wreaths: number; pathwayStakes: number; treeWraps: number; timers: number; }
export interface EstimateOptions { stories: 1 | 2; steepRoof: boolean; model: 'rental' | 'purchase'; addOns: EstimateAddOns; }
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
  stories: 1, steepRoof: false, model: 'rental',
  addOns: { wreaths: 0, pathwayStakes: 0, treeWraps: 0, timers: 0 },
};
