import { useEffect, useRef, useState } from 'react';
import type { ChangeEvent } from 'react';
import type { ContractEdits, EstimateBreakdown, Preset, PricingSettings, Project, SignedContract } from '@glowlab/shared';
import {
  INSTALL_TYPE_LABELS, MAX_CONTRACT_TOTAL, MAX_SIGNED_COPY_LENGTH, computeEstimate, contractAmounts, contractBreakdown, contractTermsFor,
  defaultDeposit, lightingRatePerFoot, money, normalizeEstimateOptions, profileFor, rateCardFor, round2, signMethodOf, takedownLaterNote,
} from '@glowlab/shared';
import { api } from '../api';
import { useAuth } from '../auth';
import SignaturePad from '../SignaturePad';
import { HouseStage } from './DesignerView';
import { buildContractPdf, contractFileName, downloadBlob, snapshotStage } from '../contractPdf';

const fmtDate = (iso: string) => new Date(iso).toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' });

/** Parses a typed number or dollar amount ("1,250.50", "$900", "40 ft") — NaN if it isn't one, undefined if blank. */
const parseNum = (s: string): number | undefined => { const t = s.replace(/[$,\s]|ft/gi, ''); return t === '' ? undefined : Number(t); };
const bad = (n: number | undefined) => n !== undefined && (!Number.isFinite(n) || n < 0);
const amountText = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(2));

/** Today as YYYY-MM-DD in local time (for a date input). */
const todayInput = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

const readAsDataUrl = (file: Blob) => new Promise<string>((resolve, reject) => {
  const r = new FileReader();
  r.onload = () => resolve(String(r.result));
  r.onerror = () => reject(new Error("Couldn't read that file"));
  r.readAsDataURL(file);
});

/** A signed copy ready to upload: PDFs as they are; photos shrunk to 2000 px JPEG (still easy to read). */
async function signedCopyDataUrl(file: File): Promise<string> {
  if (file.type === 'application/pdf') return readAsDataUrl(file);
  if (!file.type.startsWith('image/')) throw new Error('Choose a photo or a PDF of the signed contract');
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const i = new Image(); i.onload = () => resolve(i); i.onerror = () => reject(new Error("Couldn't open that photo")); i.src = url;
    });
    const scale = Math.min(1, 2000 / Math.max(img.naturalWidth, img.naturalHeight));
    const c = document.createElement('canvas');
    c.width = Math.round(img.naturalWidth * scale); c.height = Math.round(img.naturalHeight * scale);
    const ctx = c.getContext('2d');
    if (!ctx) throw new Error("Couldn't process that photo");
    ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, c.width, c.height); ctx.drawImage(img, 0, 0, c.width, c.height);
    let q = 0.85; let out = c.toDataURL('image/jpeg', q);
    while (out.length > MAX_SIGNED_COPY_LENGTH && q > 0.4) { q -= 0.15; out = c.toDataURL('image/jpeg', q); }
    return out;
  } finally { URL.revokeObjectURL(url); }
}

function PriceTable({ estimate, price, takedown, deposit, balance }: {
  estimate: EstimateBreakdown; price: number; takedown: number; deposit: number; balance: number;
}) {
  const halfDeposit = Math.abs(deposit - defaultDeposit(price)) < 0.005;
  return (
    <>
      <table className="estimate-table"><tbody>
        {estimate.lines.map((l, i) => <tr key={i}><td>{l.label}<br /><span className="muted small">{l.detail}</span></td><td className="num">{money(l.amount)}</td></tr>)}
      </tbody></table>
      <p>{estimate.totalFeet} ft of lighting • {estimate.bulbCount} bulbs</p>
      <p className="total-row"><span>Contract price{takedown > 0 ? ' (this season)' : ''}</span><span>{money(price)}</span></p>
      <p className="total-row deposit"><span>Deposit due at signing{halfDeposit ? ' (50%)' : ''}</span><span>{money(deposit)}</span></p>
      <p className="total-row"><span>Balance due on completion</span><span>{money(balance)}</span></p>
      {takedown > 0 && (
        <div className="later-fee">
          <p className="fee-row"><span>Takedown / reinstall fee <span className="muted small">— collected later</span></span><span>{money(takedown)}</span></p>
          <p className="small">{takedownLaterNote(takedown)}</p>
        </div>
      )}
    </>
  );
}

/** Blank lines to sign on paper (a saved contract that isn't signed yet). */
function BlankSignLines({ businessName }: { businessName: string }) {
  return (
    <div className="sign-grid paper-lines">
      <div className="sign-field sign-wide"><span className="sign-line" /><span className="sign-label">Customer signature</span></div>
      <div className="sign-field"><span className="sign-line" /><span className="sign-label">Date</span></div>
      <div className="sign-field sign-wide"><span className="sign-line" /><span className="sign-label">Printed name</span></div>
      <div className="sign-field"><span className="sign-line" /><span className="sign-label">Phone</span></div>
      <div className="sign-field sign-wide"><span className="sign-line" /><span className="sign-label">For {businessName || 'the installer'}</span></div>
      <div className="sign-field"><span className="sign-line" /><span className="sign-label">Date</span></div>
    </div>
  );
}

/**
 * The contract for one job, in three states:
 * - drafting (a quote): set the contract details, then save it to sign later or sign it now;
 * - saved, waiting for a signature: share/download it, sign it here, or upload the signed copy;
 * - signed (a project): the frozen contract, shareable, with the signature or the signed copy.
 */
export default function ContractView({ project, presets, settings, onSigned, onBack, onVoided, onSaved, backLabel }: {
  project: Project; presets: Preset[]; settings: PricingSettings;
  onBack: () => void; onSigned?: (p: Project) => void; onVoided?: (p: Project) => void;
  /** The contract was saved (unsigned): the parent should show this project from now on. */
  onSaved?: (p: Project) => void;
  backLabel?: string;
}) {
  const { user } = useAuth();
  const status = project.status ?? 'quote';
  const frozen: SignedContract | null = (status === 'contract' || status === 'won') && project.contract ? project.contract : null;
  const signed = status === 'won' && frozen ? frozen : null;
  const saved = status === 'contract' && frozen ? frozen : null;
  const [editing, setEditing] = useState(!frozen);
  const showing = editing ? null : frozen; // the frozen contract on screen (saved or signed), or null while drafting

  const [terms, setTerms] = useState<string | null>(null);
  const [customerName, setCustomerName] = useState(frozen?.customerName || project.clientName);
  const [customerPhone, setCustomerPhone] = useState(frozen?.customerPhone ?? '');
  const [customerEmail, setCustomerEmail] = useState(frozen?.customerEmail ?? '');
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
  const [busy, setBusy] = useState<null | 'save' | 'sign' | 'upload'>(null);
  const [error, setError] = useState<string | null>(null);
  const sectionRef = useRef<HTMLElement>(null);
  const [pdf, setPdf] = useState<Blob | null>(null);
  const [pdfError, setPdfError] = useState<string | null>(null);
  const [sendNote, setSendNote] = useState<string | null>(null);
  // Upload a signed copy (saved contracts)
  const [copyFile, setCopyFile] = useState<{ dataUrl: string; name: string } | null>(null);
  const [copyError, setCopyError] = useState<string | null>(null);
  const [signedDate, setSignedDate] = useState(todayInput());
  const [signedBy, setSignedBy] = useState(frozen?.customerName || project.clientName);
  // Viewing the uploaded copy (signed by upload)
  const [copyImage, setCopyImage] = useState<string | null>(null);

  // A saved or signed contract: build the PDF in the background as soon as it shows, so
  // Share/Download respond instantly (phones only allow sharing right after a tap).
  useEffect(() => {
    if (!showing) { setPdf(null); return; }
    let cancelled = false;
    setPdf(null); setPdfError(null);
    (async () => {
      try {
        const photo = sectionRef.current?.querySelector('img.stage-photo') as HTMLImageElement | null;
        if (photo && !photo.complete) await new Promise((r) => { photo.onload = r; photo.onerror = r; });
        const picture = await snapshotStage(sectionRef.current?.querySelector('.stage') as HTMLElement | null);
        const blob = await buildContractPdf(showing, project.signatureDataUrl ?? null, picture);
        if (!cancelled) setPdf(blob);
      } catch (e) { if (!cancelled) setPdfError(`Couldn't make the PDF: ${(e as Error).message}`); }
    })();
    return () => { cancelled = true; };
  }, [showing, project.signatureDataUrl]);

  useEffect(() => {
    if (signed) return;
    api.getContractTerms().then(({ terms: t }) => setTerms(contractTermsFor(t, user?.name ?? ''))).catch((e: Error) => setError(e.message));
  }, [signed, user?.name]);

  const download = () => { if (pdf && showing) downloadBlob(pdf, contractFileName(showing)); };
  const share = async () => {
    if (!pdf || !showing) return;
    setSendNote(null);
    const name = contractFileName(showing);
    const file = new File([pdf], name, { type: 'application/pdf' });
    const a = contractAmounts(showing);
    const isSigned = Boolean(showing.signedAt);
    const message = isSigned
      ? `Hi ${showing.customerName}, here is your signed holiday lighting agreement with ${showing.businessName}. Contract price ${money(a.price)}, deposit ${money(a.deposit)}. Thank you!`
      : `Hi ${showing.customerName}, here is your holiday lighting agreement with ${showing.businessName} (contract price ${money(a.price)}, deposit ${money(a.deposit)}). Please review it, sign it and send it back. Thank you!`;
    const title = isSigned ? 'Signed lighting agreement' : 'Lighting agreement to sign';
    const nav = navigator as Navigator & { canShare?: (d: ShareData) => boolean };
    if (nav.share && nav.canShare?.({ files: [file] })) {
      try {
        await nav.share({ files: [file], title, text: message });
        setSendNote('Shared ✓');
      } catch (e) {
        if ((e as Error).name !== 'AbortError') setSendNote(`Couldn't open sharing: ${(e as Error).message}. Use Download PDF instead.`);
      }
      return;
    }
    // No share sheet here (most desktop browsers): download it and start an email to attach it to.
    downloadBlob(pdf, name);
    const email = showing.customerEmail || customerEmail;
    if (email) {
      const subject = encodeURIComponent(`${isSigned ? 'Your signed lighting agreement' : 'Your lighting agreement to sign'} — ${showing.businessName}`);
      const body = encodeURIComponent(`${message}\n\n(The PDF is attached.)`);
      window.location.href = `mailto:${encodeURIComponent(email)}?subject=${subject}&body=${body}`;
      setSendNote(`PDF downloaded and an email to ${email} opened — attach "${name}" from your Downloads and send.`);
    } else {
      setSendNote(`PDF downloaded as "${name}". No email is on the contract, so attach it to a text or email to the customer, or print it.`);
    }
  };

  const preset = presets.find((p) => p.id === project.presetId) ?? presets[0];
  if (!preset) return <div className="spinner" aria-label="Loading" />;
  const opts = normalizeEstimateOptions(project.estimateOptions);
  const profile = profileFor(settings, opts);
  const liveEstimate = computeEstimate(project, preset, settings, opts);

  // ----- drafting: the design's estimate with the installer's edits
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
  const draftDeposit = depositTyped ?? defaultDeposit(draftPrice);
  const priceProblem = showing ? null : fieldProblem ?? draft?.error
    ?? (draftPrice <= 0 ? 'This design has no estimate yet. Type the feet of lighting or the contract price you agreed on.'
      : draftPrice > MAX_CONTRACT_TOTAL ? 'That price looks too high — check it for typos.'
      : draftDeposit > draftPrice ? "The deposit can't be more than the contract price." : null);
  const estimate = showing?.estimate ?? (draft && !draft.error ? draft.breakdown : liveEstimate);
  const amounts = showing ? contractAmounts(showing) : priceProblem
    ? { price: 0, takedown: 0, total: 0, deposit: 0, balance: 0 }
    : { price: draftPrice, takedown: draftTakedown, total: draftPrice, deposit: round2(draftDeposit), balance: round2(draftPrice - draftDeposit) };
  const anyEdits = Boolean(feetText || bulbsText || takedownText || priceText || depositText || takedownOn !== null);
  const resetEdits = () => { setFeetText(''); setBulbsText(''); setTakedownOn(null); setTakedownText(''); setPriceText(''); setDepositText(''); setAgreed(false); };
  const businessName = showing?.businessName ?? user?.name ?? '';
  const editInput = {
    customerName, customerPhone, customerEmail,
    feet: edits.feet, bulbCount: edits.bulbCount, takedownIncluded: edits.takedownIncluded, takedownAmount: edits.takedownAmount,
    contractTotal: edits.contractTotal, depositDue: amounts.deposit,
  };

  // Edit a saved contract: start from what was saved.
  const startEditing = () => {
    if (saved) {
      const a = contractAmounts(saved);
      setFeetText(amountText(saved.estimate.totalFeet)); setBulbsText(String(saved.estimate.bulbCount));
      setTakedownOn(a.takedown > 0); setTakedownText(a.takedown > 0 ? amountText(a.takedown) : '');
      setPriceText(amountText(a.price)); setDepositText(amountText(a.deposit));
    }
    setAgreed(false); setEditing(true); window.scrollTo(0, 0);
  };

  const canSave = editing && !priceProblem && Boolean(terms) && busy === null;
  const canSign = !signed && Boolean(terms || saved) && customerName.trim() !== '' && Boolean(signature) && agreed && busy === null && !priceProblem;

  const saveContract = async () => {
    if (!canSave) return;
    setBusy('save'); setError(null);
    try {
      const { project: p } = await api.prepareContract(project.id, editInput);
      setEditing(false); setBusy(null); window.scrollTo(0, 0);
      onSaved?.(p);
    } catch (e) { setError((e as Error).message); setBusy(null); }
  };
  const sign = async () => {
    if (!canSign || !signature) return;
    setBusy('sign'); setError(null);
    try {
      // Editing a saved contract and signing straight away: save the edits first so they're what gets signed.
      if (editing && status === 'contract') await api.prepareContract(project.id, editInput);
      const { project: p } = await api.signContract(project.id, { ...editInput, signatureDataUrl: signature, agreed });
      onSigned?.(p);
    } catch (e) { setError((e as Error).message); setBusy(null); }
  };
  const pickCopy = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    setCopyError(null); setCopyFile(null);
    if (!file) return;
    try {
      const dataUrl = await signedCopyDataUrl(file);
      if (dataUrl.length > MAX_SIGNED_COPY_LENGTH) throw new Error('That file is too large (over about 2.8 MB). Try a photo of the signed page, or a smaller PDF.');
      setCopyFile({ dataUrl, name: file.name });
    } catch (err) { setCopyError((err as Error).message); }
  };
  const uploadCopy = async () => {
    if (!copyFile || busy !== null) return;
    setBusy('upload'); setCopyError(null);
    try {
      const { project: p } = await api.uploadSigned(project.id, { fileDataUrl: copyFile.dataUrl, fileName: copyFile.name, signedDate, customerName: signedBy.trim() || undefined });
      onSigned?.(p);
    } catch (e) { setCopyError((e as Error).message); setBusy(null); }
  };
  const viewCopy = async () => {
    setError(null);
    try {
      const { dataUrl, name, type } = await api.getSignedCopy(project.id);
      if (type.startsWith('image/')) { setCopyImage(dataUrl); return; }
      const blob = await (await fetch(dataUrl)).blob();
      const url = URL.createObjectURL(blob);
      if (!window.open(url, '_blank')) downloadBlob(blob, name);
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch (e) { setError((e as Error).message); }
  };
  const downloadCopy = async () => {
    try {
      const { dataUrl, name } = await api.getSignedCopy(project.id);
      downloadBlob(await (await fetch(dataUrl)).blob(), name);
    } catch (e) { setError((e as Error).message); }
  };
  const voidIt = async () => {
    const question = signed
      ? `Void the signed contract for ${project.clientName}? The signature${signMethodOf(signed) === 'upload' ? ' and the uploaded signed copy are' : ' is'} deleted and the job goes back to Quotes. This can't be undone.`
      : `Cancel the saved contract for ${project.clientName}? It goes back to being a quote (you can make a new contract any time).`;
    if (!window.confirm(question)) return;
    try { const { project: p } = await api.voidContract(project.id); onVoided?.(p); } catch (e) { setError((e as Error).message); }
  };

  const uploaded = signed && signMethodOf(signed) === 'upload';
  const contractDate = showing ? (showing.signedAt || showing.preparedAt || new Date().toISOString()) : new Date().toISOString();

  return (
    <div>
      <div className="toolbar no-print">
        {editing && saved
          ? <button onClick={() => { resetEdits(); setEditing(false); }}>← Keep saved contract</button>
          : <button onClick={onBack}>{backLabel ?? (signed ? '← All projects' : '← Back to quote')}</button>}
        {editing && (
          <button className="primary cta" onClick={() => { void saveContract(); }} disabled={!canSave}
            title="Saves the contract with this price so you can share it or print it and get it signed later">
            {busy === 'save' ? 'Saving…' : saved ? 'Save changes (sign later)' : 'Save contract (sign later)'}
          </button>
        )}
        {showing && <button className="primary cta" onClick={() => { void share(); }} disabled={!pdf}>{pdf ? 'Share contract' : 'Preparing PDF…'}</button>}
        {showing && <button onClick={download} disabled={!pdf}>Download PDF</button>}
        {showing && <button onClick={() => window.print()}>Print</button>}
        {saved && !editing && <button onClick={startEditing}>Edit details</button>}
      </div>
      {signed && (
        <p className="signed-banner no-print">
          ✓ Signed by {signed.customerName} on {fmtDate(signed.signedAt)}{uploaded ? ' — signed copy uploaded' : ''}
        </p>
      )}
      {saved && !editing && (
        <p className="pending-banner no-print">
          Saved {fmtDate(saved.preparedAt ?? project.updatedAt)} — waiting for the customer’s signature. Share it now or later, sign it here, or upload the signed copy below.
        </p>
      )}
      {sendNote && <p className="send-note no-print">{sendNote}</p>}
      {pdfError && <p className="error no-print">{pdfError}</p>}
      {error && <p className="error no-print">{error}</p>}

      {editing && (
        <div className="price-setter no-print">
          <div className="price-setter-head">
            <h3>Contract details</h3>
            <span className="muted small">Estimate {money(liveEstimate.total)}</span>
          </div>
          <p className="muted small">Adjust what goes on the contract. Blank fields use the design. The agreement below updates as you type.</p>

          <div className="price-fields">
            <label>Feet of lighting
              <input inputMode="decimal" value={feetText} onChange={edited(setFeetText)} placeholder={`${liveEstimate.totalFeet} ft`} aria-label="Feet of lighting" />
            </label>
            <label>Bulbs
              <input inputMode="numeric" value={bulbsText} onChange={edited(setBulbsText)} placeholder={String(liveEstimate.bulbCount)} aria-label="Bulb count" />
            </label>
          </div>
          {feetText && !bad(feet) && <p className="muted small">Lighting priced at {money(lightingRatePerFoot(settings, opts))}/ft.</p>}

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
              Customer signs for <strong>{money(amounts.price)}</strong>: {money(amounts.deposit)} now, {money(amounts.balance)} on completion.
              {amounts.takedown > 0 && <> Takedown / reinstall {money(amounts.takedown)} is listed as collected later.</>}
              {anyEdits && <> <button type="button" className="link" onClick={resetEdits}>Reset to the design</button></>}
            </p>
          )}
          <p className="muted small">
            <strong>Save contract (sign later)</strong> locks in this price so you can share it by email or print it, then sign it here or upload the signed copy later.
            Or have the customer sign now at the bottom.
          </p>
        </div>
      )}

      <section className="quote contract" ref={sectionRef}>
        <h2 className="brand"><img src="/icon-192.png" alt="" className="brand-mark" />{businessName || 'GlowLab'}</h2>
        <h3 className="contract-title">Holiday Lighting Installation Agreement</h3>
        <p>
          Date: <strong>{fmtDate(contractDate)}</strong><br />
          Customer: <strong>{showing?.clientName ?? project.clientName}</strong>{(showing?.address ?? project.address) ? ` — ${showing?.address ?? project.address}` : ''}<br />
          Design: <strong>{showing?.presetName ?? preset.name}</strong> — {INSTALL_TYPE_LABELS[showing?.installType ?? opts.installType]} lighting
          {' '}({(showing?.installType ?? opts.installType) === 'permanent' ? 'permanent LED' : preset.bulbSize}, {showing?.bulbSpacingInches ?? profile.bulbSpacingInches}&quot; spacing)
        </p>
        <HouseStage project={project} preset={preset} spacingInches={showing?.bulbSpacingInches ?? profile.bulbSpacingInches}
          installType={showing?.installType ?? opts.installType} night />
        <PriceTable estimate={estimate} price={amounts.price} takedown={amounts.takedown} deposit={amounts.deposit} balance={amounts.balance} />

        <h3 className="contract-subtitle">Terms</h3>
        {showing || terms ? <div className="contract-terms">{showing?.terms ?? terms}</div> : <p className="muted">Loading terms…</p>}

        <h3 className="contract-subtitle">Signatures</h3>
        {signed && !uploaded && (
          <div className="signed-block">
            <div className="signed-sig">
              {project.signatureDataUrl
                ? <img src={project.signatureDataUrl} alt={`Signature of ${signed.customerName}`} className="signature-img" />
                : <span className="muted small">Signature on file</span>}
              <span className="sign-label">Customer signature</span>
            </div>
            <p className="small">
              Signed electronically by <strong>{signed.customerName}</strong> on {fmtDate(signed.signedAt)}.
              {signed.customerPhone && <><br />Phone: {signed.customerPhone}</>}
              {signed.customerEmail && <><br />Email: {signed.customerEmail}</>}
            </p>
            <p className="small">Accepted for <strong>{signed.businessName}</strong>.</p>
            {signed.signerIp && <p className="muted small audit">Signature record: IP {signed.signerIp}</p>}
          </div>
        )}
        {signed && uploaded && (
          <div className="signed-block">
            <p className="small">
              Signed by <strong>{signed.customerName}</strong> on {fmtDate(signed.signedAt)}. The signed copy is kept on file.
              {signed.customerPhone && <><br />Phone: {signed.customerPhone}</>}
              {signed.customerEmail && <><br />Email: {signed.customerEmail}</>}
            </p>
            <p className="small">Accepted for <strong>{signed.businessName}</strong>.</p>
            <div className="toolbar no-print">
              <button onClick={() => { void viewCopy(); }}>View signed copy</button>
              <button onClick={() => { void downloadCopy(); }}>Download signed copy</button>
            </div>
            {copyImage && <img src={copyImage} alt="Signed copy of the contract" className="signed-copy-img no-print" />}
          </div>
        )}
        {saved && !editing && <BlankSignLines businessName={saved.businessName} />}

        {!signed && (
          <div className="sign-form no-print">
            {saved && !editing && <h4 className="sign-now-title">Sign now on this device</h4>}
            <div className="row">
              <label>Customer name<input value={customerName} onChange={(e) => { setCustomerName(e.target.value); setSignedBy(e.target.value); }} autoComplete="name" /></label>
              <label>Phone<input value={customerPhone} onChange={(e) => setCustomerPhone(e.target.value)} type="tel" autoComplete="tel" /></label>
            </div>
            <label>Email (optional)<input value={customerEmail} onChange={(e) => setCustomerEmail(e.target.value)} type="email" autoComplete="email" /></label>
            <SignaturePad onChange={setSignature} disabled={busy !== null} />
            <label className="agree">
              <input type="checkbox" checked={agreed} onChange={(e) => setAgreed(e.target.checked)} />
              <span>I have read and agree to this agreement, including the {money(amounts.price)} contract price and the {money(amounts.deposit)} deposit{amounts.takedown > 0 ? `, and the ${money(amounts.takedown)} takedown / reinstall fee to be collected later` : ''}, and I agree to sign it electronically.</span>
            </label>
            <button className="primary big" onClick={() => { void sign(); }} disabled={!canSign}>{busy === 'sign' ? 'Signing…' : 'Sign contract'}</button>
            {!canSign && busy === null && (
              <p className="muted small">{priceProblem ? 'Fix the contract details at the top. ' : ''}{!customerName.trim() ? 'Enter the customer’s name. ' : ''}{!signature ? 'Sign in the box. ' : ''}{!agreed ? 'Tick the box to agree.' : ''}</p>
            )}
          </div>
        )}
      </section>

      {saved && !editing && (
        <div className="upload-card no-print">
          <h3>Signed on paper or by email?</h3>
          <p className="muted small">Upload a photo or PDF of the signed contract. It’s kept with the job, and the quote becomes a project.</p>
          <label className="file-pick">
            <input type="file" accept="image/*,application/pdf" onChange={(e) => { void pickCopy(e); }} />
            <span>{copyFile ? `✓ ${copyFile.name}` : 'Choose photo or PDF…'}</span>
          </label>
          {copyFile?.dataUrl.startsWith('data:image/') && <img src={copyFile.dataUrl} alt="Signed copy preview" className="signed-copy-img" />}
          <div className="price-fields">
            <label>Date signed<input type="date" value={signedDate} max={todayInput()} onChange={(e) => setSignedDate(e.target.value)} /></label>
            <label>Signed by<input value={signedBy} onChange={(e) => setSignedBy(e.target.value)} /></label>
          </div>
          {copyError && <p className="error small">{copyError}</p>}
          <button className="primary" onClick={() => { void uploadCopy(); }} disabled={!copyFile || busy !== null}>
            {busy === 'upload' ? 'Uploading…' : 'Upload and mark as signed'}
          </button>
        </div>
      )}

      {signed && <button className="danger no-print void-btn" onClick={() => { void voidIt(); }}>Void contract</button>}
      {saved && !editing && <button className="danger no-print void-btn" onClick={() => { void voidIt(); }}>Cancel saved contract</button>}
    </div>
  );
}
