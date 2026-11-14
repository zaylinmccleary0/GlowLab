import type { SignContractInput, SignedContract } from './types';

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

/** What the customer owes under a signed contract: total, deposit at signing, and balance on completion. */
export function contractAmounts(c: SignedContract): { total: number; deposit: number; balance: number; adjustment: number } {
  const total = typeof c.contractTotal === 'number' ? c.contractTotal : c.estimate.total;
  const deposit = typeof c.depositDue === 'number' ? c.depositDue : c.estimate.depositDue;
  return { total, deposit, balance: cents(total - deposit), adjustment: cents(total - c.estimate.total) };
}

/** The default deposit for a contract price: 50%. */
export function defaultDeposit(total: number): number { return cents(total / 2); }

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
  if (b.depositDue !== undefined && b.depositDue !== null) {
    const deposit = Number(b.depositDue);
    if (!Number.isFinite(deposit) || deposit < 0) return { error: "The deposit can't be negative" };
    input.depositDue = cents(deposit);
  }
  return { input };
}
