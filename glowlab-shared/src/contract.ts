import type { EstimateBreakdown, EstimateLine, SignContractInput, SignedContract } from './types';
import { money } from './pricing';

/**
 * Starter contract terms. Each business edits these in Settings; they are copied into
 * every contract when it's signed. Not legal advice: have them reviewed for your state.
 * {business} is replaced with the business name.
 */
export const DEFAULT_CONTRACT_TERMS = `1. Scope of work. {business} will supply and install the holiday lighting described in this agreement at the address above. Footage is estimated from the design and confirmed on install day.

2. Price and payment. The customer agrees to the total shown above. A 50% deposit is due at signing to reserve an install date. The remaining balance is due when installation is complete.

3. Price changes. This price is an estimate. If the measured footage, roof conditions or requested work differ from this design, the price may change; any change will be agreed with the customer before the work is done.

4. Scheduling. Install dates are scheduled in the order deposits are received and may move for weather or safety.

5. Access and property. The customer gives {business} access to the property, roof and outdoor power outlets needed for the work. {business} will take reasonable care of the property and is not responsible for existing damage or for failures of the home's electrical system.

6. Seasonal lighting. Seasonal lights are taken down after the holiday season as agreed. Lights, clips and timers supplied by {business} remain its property unless purchased.

7. Permanent lighting. Permanent lighting stays installed year-round; warranty terms are provided separately.

8. Cancellation. If the customer cancels before installation, the deposit is refundable minus any materials already ordered.

9. Electronic signature. The customer agrees that signing electronically has the same effect as signing on paper.`;

export const MAX_CONTRACT_TERMS_LENGTH = 20_000;
/** Drawn signatures are small PNGs; this cap keeps a stray huge upload out. */
export const MAX_SIGNATURE_LENGTH = 400_000;

/** Highest contract price accepted (keeps typos like an extra zero or two from slipping through). */
export const MAX_CONTRACT_TOTAL = 1_000_000;

const cents = (n: number) => Math.round(n * 100) / 100;

/**
 * What the customer owes under a signed contract: the price (first season), the deposit at signing and
 * the balance on completion. The takedown / reinstall fee is listed separately: it's collected later.
 */
export function contractAmounts(c: SignedContract): { price: number; takedown: number; total: number; deposit: number; balance: number } {
  const price = typeof c.contractTotal === 'number' ? c.contractTotal : c.estimate.total;
  const takedown = typeof c.takedownFee === 'number' ? c.takedownFee : 0;
  const deposit = typeof c.depositDue === 'number' ? c.depositDue : c.estimate.depositDue;
  return { price, takedown, total: price, deposit, balance: cents(price - deposit) };
}

/** The line that explains the later takedown / reinstall fee on the contract. */
export function takedownLaterNote(fee: number): string {
  return `A takedown / reinstall fee of ${money(fee)} applies after this season. It is not part of the contract price or the amounts due above, and is billed separately when the lights are taken down and reinstalled (about a year from now).`;
}

/** The default deposit for a contract price: 50%. */
export function defaultDeposit(total: number): number { return cents(total / 2); }

/** What can be changed on the contract before signing (all optional: blank = from the design). */
export interface ContractEdits {
  feet?: number; bulbCount?: number;
  takedownIncluded?: boolean; takedownAmount?: number;
  contractTotal?: number;
}

/** A lighting line's label/detail when the design didn't have one (no traced footage). */
const BLANK_LIGHTING: EstimateLine = { label: 'Holiday lighting installation', detail: '', amount: 0, kind: 'lighting' };

/**
 * The price breakdown printed on the contract: the design's estimate with the installer's edits.
 * Feet re-price the lighting line at ratePerFoot; a typed contract price is absorbed into the
 * lighting line so the lines always add up to the contract price. Takedown / reinstall is not a
 * line: it comes back as takedownFee, a separate fee added on top of the contract price.
 */
export function contractBreakdown(base: EstimateBreakdown, ratePerFoot: number, edits: ContractEdits): { breakdown: EstimateBreakdown; takedownFee: number; error?: string } {
  const feet = edits.feet ?? base.totalFeet;
  const bulbCount = edits.bulbCount ?? base.bulbCount;
  const baseLighting = base.lines.find((l) => l.kind === 'lighting') ?? (base.totalFeet > 0 ? base.lines[0] : undefined);
  const others = base.lines.filter((l) => l !== baseLighting && l.kind !== 'takedown');
  const baseTakedown = base.lines.find((l) => l.kind === 'takedown');

  let lighting: EstimateLine | null = null;
  if (feet > 0 || edits.contractTotal !== undefined) {
    const from = baseLighting ?? BLANK_LIGHTING;
    const feetChanged = edits.feet !== undefined && Math.abs(edits.feet - base.totalFeet) >= 0.005;
    const amount = feetChanged || !baseLighting ? cents(feet * ratePerFoot) : from.amount;
    const rest = from.detail.split(', ').slice(1).join(', ');
    const detail = feet > 0 ? [`${cents(feet)} ft × ${money(ratePerFoot)}/ft`, rest].filter(Boolean).join(', ') : rest;
    lighting = { ...from, kind: 'lighting', amount, detail };
  }

  const takedownOn = edits.takedownIncluded ?? Boolean(baseTakedown);
  const takedownAmount = cents(edits.takedownAmount ?? baseTakedown?.amount ?? 0);
  const takedownFee = takedownOn && takedownAmount > 0 ? takedownAmount : 0;

  // With takedown charged as its own fee, the lighting line can't also say it's included.
  if (takedownFee > 0 && lighting) lighting.detail = lighting.detail.replace('seasonal (install + takedown included)', 'seasonal install');

  // Keep the design's order: lighting first, add-ons, then fees.
  const addons = others.filter((l) => l.kind !== 'fee');
  const fees = others.filter((l) => l.kind === 'fee');
  const lines = [lighting, ...addons, ...fees].filter((l): l is EstimateLine => Boolean(l));
  const sumOthers = cents(lines.filter((l) => l !== lighting).reduce((s, l) => s + l.amount, 0));

  if (edits.contractTotal !== undefined && lighting) {
    const lightingAmount = cents(edits.contractTotal - sumOthers);
    if (lightingAmount < 0) {
      return { breakdown: base, takedownFee, error: `The contract price can't be less than the other items (${money(sumOthers)}).` };
    }
    if (Math.abs(lightingAmount - lighting.amount) >= 0.005) {
      // A negotiated price: show the footage but not a per-foot rate that no longer matches.
      lighting.amount = lightingAmount;
      lighting.detail = [feet > 0 ? `${cents(feet)} ft of lighting` : '', lighting.detail.split(', ').slice(1).join(', ')].filter(Boolean).join(', ');
    }
  }

  const total = cents(lines.reduce((s, l) => s + l.amount, 0));
  return {
    breakdown: { lines, bulbCount, clipCount: bulbCount, totalFeet: cents(feet), subtotal: total, total, depositDue: defaultDeposit(total) },
    takedownFee,
  };
}

/** The terms with the business name filled in. */
export function contractTermsFor(terms: string | null | undefined, businessName: string): string {
  return (terms && terms.trim() ? terms : DEFAULT_CONTRACT_TERMS).split('{business}').join(businessName || 'The installer');
}

/** Checks what the customer filled in. Returns the cleaned input or the first problem. */
export function validateSignInput(raw: unknown): { input?: SignContractInput; error?: string } {
  const b = (raw ?? {}) as Record<string, unknown>;
  const str = (v: unknown, max: number) => (typeof v === 'string' ? v.trim().slice(0, max) : '');
  const customerName = str(b.customerName, 120);
  if (!customerName) return { error: "The customer's name is required" };
  const customerPhone = str(b.customerPhone, 40);
  const customerEmail = str(b.customerEmail, 200);
  if (customerEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(customerEmail)) return { error: "That email address doesn't look right" };
  const signatureDataUrl = b.signatureDataUrl;
  if (typeof signatureDataUrl !== 'string' || !signatureDataUrl.startsWith('data:image/png;base64,')) return { error: 'A signature is required' };
  if (signatureDataUrl.length > MAX_SIGNATURE_LENGTH) return { error: 'The signature image is too large' };
  if (b.agreed !== true) return { error: 'The customer must agree to the terms' };
  const input: SignContractInput = { customerName, customerPhone, customerEmail, signatureDataUrl, agreed: true };
  if (b.contractTotal !== undefined && b.contractTotal !== null) {
    const total = Number(b.contractTotal);
    if (!Number.isFinite(total) || total <= 0) return { error: 'The contract price must be more than $0' };
    if (total > MAX_CONTRACT_TOTAL) return { error: 'The contract price looks too high — check it for typos' };
    input.contractTotal = cents(total);
  }
  const num = (key: string, max: number, label: string): string | null => {
    const v = b[key];
    if (v === undefined || v === null || v === '') return null;
    const n = Number(v);
    if (!Number.isFinite(n) || n < 0) return `${label} must be a number of 0 or more`;
    if (n > max) return `${label} looks too high — check it for typos`;
    (input as unknown as Record<string, number>)[key] = key === 'bulbCount' ? Math.round(n) : cents(n);
    return null;
  };
  const numError = num('feet', 100_000, 'Feet of lighting') ?? num('bulbCount', 100_000, 'The bulb count') ?? num('takedownAmount', MAX_CONTRACT_TOTAL, 'The takedown / reinstall price');
  if (numError) return { error: numError };
  if (typeof b.takedownIncluded === 'boolean') input.takedownIncluded = b.takedownIncluded;
  if (b.depositDue !== undefined && b.depositDue !== null) {
    const deposit = Number(b.depositDue);
    if (!Number.isFinite(deposit) || deposit < 0) return { error: "The deposit can't be negative" };
    input.depositDue = cents(deposit);
  }
  return { input };
}
