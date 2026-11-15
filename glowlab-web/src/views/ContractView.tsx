import { useEffect, useRef, useState } from 'react';
import type { EstimateBreakdown, Preset, PricingSettings, Project } from '@glowlab/shared';
import {
  INSTALL_TYPE_LABELS, MAX_CONTRACT_TOTAL, computeEstimate, contractAmounts, contractBreakdown, contractTermsFor, defaultDeposit,
  lightingRatePerFoot, money, normalizeEstimateOptions, profileFor, rateCardFor, round2,
} from '@glowlab/shared';
import type { ContractEdits } from '@glowlab/shared';
import { api } from '../api';
import { useAuth } from '../auth';
import SignaturePad from '../SignaturePad';
import { HouseStage } from './DesignerView';
import { buildContractPdf, contractFileName, downloadBlob, snapshotStage } from '../contractPdf';

const fmtDate = (iso: string) => new Date(iso).toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' });
const fmtTime = (iso: string) => new Date(iso).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });

/** Parses a typed number or dollar amount ("1,250.50", "$900", "40 ft") — NaN if it isn't one, undefined if blank. */
const parseNum = (s: string): number | undefined => { const t = s.replace(/[$,\s]|ft/gi, ''); return t === '' ? undefined : Number(t); };
const bad = (n: number | undefined) => n !== undefined && (!Number.isFinite(n) || n < 0);

function PriceTable({ estimate, price, takedown, total, deposit, balance }: {
  estimate: EstimateBreakdown; price: number; takedown: number; total: number; deposit: number; balance: number;
}) {
  const halfDeposit = Math.abs(deposit - defaultDeposit(price)) < 0.005;
  return (
    <>
      <table className="estimate-table"><tbody>
        {estimate.lines.map((l, i) => <tr key={i}><td>{l.label}<br /><span className="muted small">{l.detail}</span></td><td className="num">{money(l.amount)}</td></tr>)}
      </tbody></table>
      <p>{estimate.totalFeet} ft of lighting • {estimate.bulbCount} bulbs</p>
      <p className="total-row"><span>Contract price</span><span>{money(price)}</span></p>
      {takedown > 0 && (
        <>
          <p className="fee-row"><span>Takedown / reinstall fee <span className="muted small">(added to the contract price)</span></span><span>+ {money(takedown)}</span></p>
          <p className="total-row"><span>Total</span><span>{money(total)}</span></p>
        </>
      )}
      <p className="total-row deposit"><span>Deposit due at signing{halfDeposit ? ' (50% of the contract price)' : ''}</span><span>{money(deposit)}</span></p>
      <p className="total-row"><span>Balance due on completion</span><span>{money(balance)}</span></p>
    </>
  );
}

/**
 * The contract for one job. For a quote it's the signing screen: the customer reviews the
 * price and terms, fills in their details and signs on the screen. For a signed project it
 * shows the frozen contract with the signature.
 */
export default function ContractView({ project, presets, settings, onSigned, onBack, onVoided }: {
  project: Project; presets: Preset[]; settings: PricingSettings;
  onBack: () => void; onSigned?: (p: Project) => void; onVoided?: (p: Project) => void;
}) {
  const { user } = useAuth();
  const [terms, setTerms] = useState<string | null>(null);
  const [customerName, setCustomerName] = useState(project.clientName);
  const [customerPhone, setCustomerPhone] = useState('');
  const [customerEmail, setCustomerEmail] = useState('');
  const [signature, setSignature] = useState<string | null>(null);
  const [agreed, setAgreed] = useState(false);
  // Contract edits. Blank = what the design says; blank deposit = 50% of the price.
  const [feetText, setFeetText] = useState('');
  const [bulbsText, setBulbsText] = useState('');
  const [takedownOn, setTakedownOn] = useState<boolean | null>(null);
  const [takedownText, setTakedownText] = useState('');
  const [priceText, setPriceText] = useState('');
  const [depositText, setDepositText] = useState('');
  const edited = (set: (v: string) => void) => (e: { target: { value: string } }) => { set(e.target.value); setAgreed(false); };
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const signed = project.status === 'won' && project.contract ? project.contract : null;
  const sectionRef = useRef<HTMLElement>(null);
  const [pdf, setPdf] = useState<Blob | null>(null);
  const [pdfError, setPdfError] = useState<string | null>(null);
  const [sendNote, setSendNote] = useState<string | null>(null);

  // Signed contracts: build the PDF in the background as soon as the page shows, so
  // Send/Download respond instantly (phones only allow sharing right after a tap).
  useEffect(() => {
    if (!signed) return;
    let cancelled = false;
    (async () => {
      try {
        const photo = sectionRef.current?.querySelector('img.stage-photo') as HTMLImageElement | null;
        if (photo && !photo.complete) await new Promise((r) => { photo.onload = r; photo.onerror = r; });
        const picture = await snapshotStage(sectionRef.current?.querySelector('.stage') as HTMLElement | null);
        const blob = await buildContractPdf(signed, project.signatureDataUrl ?? null, picture);
        if (!cancelled) setPdf(blob);
      } catch (e) { if (!cancelled) setPdfError(`Couldn't make the PDF: ${(e as Error).message}`); }
    })();
    return () => { cancelled = true; };
  }, [signed, project.signatureDataUrl]);

  const download = () => { if (pdf && signed) downloadBlob(pdf, contractFileName(signed)); };
  const send = async () => {
    if (!pdf || !signed) return;
    setSendNote(null);
    const name = contractFileName(signed);
    const file = new File([pdf], name, { type: 'application/pdf' });
    const amounts = contractAmounts(signed);
    const message = `Hi ${signed.customerName}, here is your signed holiday lighting agreement with ${signed.businessName}. Total ${money(amounts.total)}, deposit ${money(amounts.deposit)}. Thank you!`;
    const nav = navigator as Navigator & { canShare?: (d: ShareData) => boolean };
    if (nav.share && nav.canShare?.({ files: [file] })) {
      try {
        await nav.share({ files: [file], title: 'Signed lighting agreement', text: message });
        setSendNote('Sent ✓');
      } catch (e) {
        if ((e as Error).name !== 'AbortError') setSendNote(`Couldn't open sharing: ${(e as Error).message}. Use Download PDF instead.`);
      }
      return;
    }
    // No share sheet here (most desktop browsers): download it and start an email to attach it to.
    downloadBlob(pdf, name);
    if (signed.customerEmail) {
      const subject = encodeURIComponent(`Your signed lighting agreement — ${signed.businessName}`);
      const body = encodeURIComponent(`${message}\n\n(The PDF is attached.)`);
      window.location.href = `mailto:${encodeURIComponent(signed.customerEmail)}?subject=${subject}&body=${body}`;
      setSendNote(`PDF downloaded and an email to ${signed.customerEmail} opened — attach "${name}" from your Downloads and send.`);
    } else {
      setSendNote(`PDF downloaded as "${name}". No email was given at signing, so attach it to a text or email to the customer.`);
    }
  };

  useEffect(() => {
    if (signed) return;
    api.getContractTerms().then(({ terms: t }) => setTerms(contractTermsFor(t, user?.name ?? ''))).catch((e: Error) => setError(e.message));
  }, [signed, user?.name]);

  const preset = presets.find((p) => p.id === project.presetId) ?? presets[0];
  if (!preset) return <p className="muted">Loading…</p>;
  const opts = normalizeEstimateOptions(project.estimateOptions);
  const profile = profileFor(settings, opts);
  const liveEstimate = computeEstimate(project, preset, settings, opts);

  const card = rateCardFor(settings, opts);
  const baseTakedown = liveEstimate.lines.find((l) => l.kind === 'takedown');
  const takedownIncluded = takedownOn ?? Boolean(baseTakedown);
  const feet = parseNum(feetText); const bulbs = parseNum(bulbsText); const takedownAmount = parseNum(takedownText);
  const price = parseNum(priceText); const depositTyped = parseNum(depositText);
  const edits: ContractEdits = {
    feet, bulbCount: bulbs === undefined ? undefined : Math.round(bulbs),
    takedownIncluded, takedownAmount: takedownAmount ?? (baseTakedown?.amount ?? card.takedownReinstallFee),
    contractTotal: price,
  };
  const fieldProblem = bad(feet) ? 'Enter the feet of lighting as a number, like 120.'
    : bad(bulbs) ? 'Enter the bulb count as a number, like 96.'
    : takedownIncluded && bad(takedownAmount) ? 'Enter the takedown / reinstall price as a number, like 150.'
    : bad(price) ? 'Enter the contract price as a number, like 1250.'
    : bad(depositTyped) ? 'Enter the deposit as a number, like 500.' : null;
  const draft = fieldProblem ? null : contractBreakdown(liveEstimate, lightingRatePerFoot(settings, opts), edits);
  const draftPrice = draft?.breakdown.total ?? 0;
  const draftTakedown = draft?.takedownFee ?? 0;
  const draftTotal = round2(draftPrice + draftTakedown);
  const draftDeposit = depositTyped ?? defaultDeposit(draftPrice);
  const priceProblem = fieldProblem ?? draft?.error
    ?? (draftPrice <= 0 ? 'This design has no estimate yet. Type the feet of lighting or the contract price you agreed on.'
      : draftTotal > MAX_CONTRACT_TOTAL ? 'That price looks too high — check it for typos.'
      : draftDeposit > draftTotal ? "The deposit can't be more than the total." : null);
  const estimate = signed?.estimate ?? (draft && !draft.error ? draft.breakdown : liveEstimate);
  const amounts = signed ? contractAmounts(signed) : priceProblem
    ? { price: 0, takedown: 0, total: 0, deposit: 0, balance: 0 }
    : { price: draftPrice, takedown: draftTakedown, total: draftTotal, deposit: round2(draftDeposit), balance: round2(draftTotal - draftDeposit) };
  const anyEdits = Boolean(feetText || bulbsText || takedownText || priceText || depositText || takedownOn !== null);
  const resetEdits = () => { setFeetText(''); setBulbsText(''); setTakedownOn(null); setTakedownText(''); setPriceText(''); setDepositText(''); setAgreed(false); };
  const businessName = signed?.businessName ?? user?.name ?? '';
  const canSign = !signed && Boolean(terms) && customerName.trim() !== '' && Boolean(signature) && agreed && !busy && !priceProblem;

  const sign = async () => {
    if (!canSign || !signature) return;
    setBusy(true); setError(null);
    try {
      const { project: p } = await api.signContract(project.id, {
        customerName, customerPhone, customerEmail, signatureDataUrl: signature, agreed,
        feet: edits.feet, bulbCount: edits.bulbCount, takedownIncluded: edits.takedownIncluded, takedownAmount: edits.takedownAmount,
        contractTotal: edits.contractTotal, depositDue: amounts.deposit,
      });
      onSigned?.(p);
    } catch (e) { setError((e as Error).message); setBusy(false); }
  };
  const voidIt = async () => {
    if (!window.confirm(`Void the signed contract for ${project.clientName}? The signature is deleted and the job goes back to Quotes. This can't be undone.`)) return;
    try { const { project: p } = await api.voidContract(project.id); onVoided?.(p); } catch (e) { setError((e as Error).message); }
  };

  return (
    <div>
      <div className="toolbar no-print">
        <button onClick={onBack}>{signed ? '← All projects' : '← Back to quote'}</button>
        {signed && <button className="primary cta" onClick={() => { void send(); }} disabled={!pdf}>{pdf ? 'Send to customer' : 'Preparing PDF…'}</button>}
        {signed && <button onClick={download} disabled={!pdf}>Download PDF</button>}
        {signed && <button onClick={() => window.print()}>Print</button>}
      </div>
      {signed && <p className="signed-banner no-print">✓ Signed by {signed.customerName} on {fmtDate(signed.signedAt)} at {fmtTime(signed.signedAt)}</p>}
      {sendNote && <p className="send-note no-print">{sendNote}</p>}
      {pdfError && <p className="error no-print">{pdfError}</p>}
      {error && <p className="error no-print">{error}</p>}

      {!signed && (
        <div className="price-setter no-print">
          <div className="price-setter-head">
            <h3>Contract details</h3>
            <span className="muted small">Estimate {money(liveEstimate.total)}</span>
          </div>
          <p className="muted small">Adjust what goes on the contract before the customer signs. Blank fields use the design. The agreement below updates as you type.</p>

          <div className="price-fields">
            <label>Feet of lighting
              <input inputMode="decimal" value={feetText} onChange={edited(setFeetText)} placeholder={`${liveEstimate.totalFeet} ft`} aria-label="Feet of lighting" />
            </label>
            <label>Bulbs
              <input inputMode="numeric" value={bulbsText} onChange={edited(setBulbsText)} placeholder={String(liveEstimate.bulbCount)} aria-label="Bulb count" />
            </label>
          </div>
          {feetText && !bad(feet) && <p className="muted small">Lighting re-priced at {money(lightingRatePerFoot(settings, opts))}/ft.</p>}

          <div className="takedown-row">
            <label className="switch">
              <input type="checkbox" role="switch" checked={takedownIncluded} onChange={(e) => { setTakedownOn(e.target.checked); setAgreed(false); }} />
              <span className="switch-track" aria-hidden="true"><span className="switch-thumb" /></span>
              <span>Takedown / reinstall on the contract</span>
            </label>
            {takedownIncluded && (
              <label className="takedown-amount">Price ($)
                <input inputMode="decimal" value={takedownText} onChange={edited(setTakedownText)}
                  placeholder={(baseTakedown?.amount ?? card.takedownReinstallFee).toFixed(2)} aria-label="Takedown / reinstall price" />
              </label>
            )}
          </div>
          {takedownIncluded && !bad(takedownAmount) && !(edits.takedownAmount! > 0) && (
            <p className="muted small">Type a takedown / reinstall price to add it to the contract.</p>
          )}

          <div className="price-fields">
            <label>Contract price ($)
              <input inputMode="decimal" value={priceText} onChange={edited(setPriceText)}
                placeholder={draft && !draft.error && draftPrice > 0 ? draftPrice.toFixed(2) : 'e.g. 1250'} aria-label="Contract price" />
            </label>
            <label>Deposit at signing ($)
              <input inputMode="decimal" value={depositText} onChange={edited(setDepositText)}
                placeholder={draftPrice > 0 ? `${defaultDeposit(draftPrice).toFixed(2)} (50%)` : '50% of the price'} aria-label="Deposit at signing" />
            </label>
          </div>
          {priceProblem ? <p className="error small">{priceProblem}</p> : (
            <p className="small price-summary">
              Customer signs for <strong>{money(amounts.total)}</strong>
              {amounts.takedown > 0 && <> ({money(amounts.price)} + {money(amounts.takedown)} takedown / reinstall)</>}: {money(amounts.deposit)} now, {money(amounts.balance)} on completion.
              {anyEdits && <> <button type="button" className="link" onClick={resetEdits}>Reset to the design</button></>}
            </p>
          )}
        </div>
      )}

      <section className="quote contract" ref={sectionRef}>
        <h2 className="brand"><img src="/icon-192.png" alt="" className="brand-mark" />{businessName || 'GlowLab'}</h2>
        <h3 className="contract-title">Holiday Lighting Installation Agreement</h3>
        <p>
          Date: <strong>{fmtDate(signed?.signedAt ?? new Date().toISOString())}</strong><br />
          Customer: <strong>{signed?.clientName ?? project.clientName}</strong>{(signed?.address ?? project.address) ? ` — ${signed?.address ?? project.address}` : ''}<br />
          Design: <strong>{signed?.presetName ?? preset.name}</strong> — {INSTALL_TYPE_LABELS[signed?.installType ?? opts.installType]} lighting
          {' '}({(signed?.installType ?? opts.installType) === 'permanent' ? 'permanent LED' : preset.bulbSize}, {signed?.bulbSpacingInches ?? profile.bulbSpacingInches}&quot; spacing)
        </p>
        <HouseStage project={project} preset={preset} spacingInches={signed?.bulbSpacingInches ?? profile.bulbSpacingInches}
          installType={signed?.installType ?? opts.installType} night />
        <PriceTable estimate={estimate} price={amounts.price} takedown={amounts.takedown} total={amounts.total} deposit={amounts.deposit} balance={amounts.balance} />

        <h3 className="contract-subtitle">Terms</h3>
        {signed || terms ? <div className="contract-terms">{signed?.terms ?? terms}</div> : <p className="muted">Loading terms…</p>}

        <h3 className="contract-subtitle">Signatures</h3>
        {signed ? (
          <div className="signed-block">
            <div className="signed-sig">
              {project.signatureDataUrl
                ? <img src={project.signatureDataUrl} alt={`Signature of ${signed.customerName}`} className="signature-img" />
                : <span className="muted small">Signature on file</span>}
              <span className="sign-label">Customer signature</span>
            </div>
            <p className="small">
              Signed electronically by <strong>{signed.customerName}</strong> on {fmtDate(signed.signedAt)} at {fmtTime(signed.signedAt)}.
              {signed.customerPhone && <><br />Phone: {signed.customerPhone}</>}
              {signed.customerEmail && <><br />Email: {signed.customerEmail}</>}
            </p>
            <p className="small">Accepted for <strong>{signed.businessName}</strong>.</p>
            <p className="muted small audit">Signature record: {new Date(signed.signedAt).toISOString()}{signed.signerIp ? ` • IP ${signed.signerIp}` : ''}</p>
          </div>
        ) : (
          <div className="sign-form no-print-inputs">
            <div className="row">
              <label>Customer name<input value={customerName} onChange={(e) => setCustomerName(e.target.value)} autoComplete="name" /></label>
              <label>Phone<input value={customerPhone} onChange={(e) => setCustomerPhone(e.target.value)} type="tel" autoComplete="tel" /></label>
            </div>
            <label>Email (optional)<input value={customerEmail} onChange={(e) => setCustomerEmail(e.target.value)} type="email" autoComplete="email" /></label>
            <SignaturePad onChange={setSignature} disabled={busy} />
            <label className="agree">
              <input type="checkbox" checked={agreed} onChange={(e) => setAgreed(e.target.checked)} />
              <span>I have read and agree to this agreement, including the {money(amounts.price)} contract price{amounts.takedown > 0 ? ` plus the ${money(amounts.takedown)} takedown / reinstall fee` : ''} and the {money(amounts.deposit)} deposit, and I agree to sign it electronically.</span>
            </label>
            <button className="primary big" onClick={() => { void sign(); }} disabled={!canSign}>{busy ? 'Signing…' : 'Sign contract'}</button>
            {!canSign && !busy && (
              <p className="muted small">{priceProblem ? 'Fix the contract details at the top. ' : ''}{!customerName.trim() ? 'Enter the customer’s name. ' : ''}{!signature ? 'Sign in the box. ' : ''}{!agreed ? 'Tick the box to agree.' : ''}</p>
            )}
          </div>
        )}
      </section>
      {signed && <button className="danger no-print void-btn" onClick={() => { void voidIt(); }}>Void contract</button>}
    </div>
  );
}
