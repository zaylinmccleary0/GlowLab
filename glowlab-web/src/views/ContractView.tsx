import { useEffect, useRef, useState } from 'react';
import type { EstimateBreakdown, Preset, PricingSettings, Project } from '@glowlab/shared';
import {
  INSTALL_TYPE_LABELS, computeEstimate, contractTermsFor, money, normalizeEstimateOptions, profileFor, round2,
} from '@glowlab/shared';
import { api } from '../api';
import { useAuth } from '../auth';
import SignaturePad from '../SignaturePad';
import { HouseStage } from './DesignerView';
import { buildContractPdf, contractFileName, downloadBlob, snapshotStage } from '../contractPdf';

const fmtDate = (iso: string) => new Date(iso).toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' });
const fmtTime = (iso: string) => new Date(iso).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });

function PriceTable({ estimate, balanceDue }: { estimate: EstimateBreakdown; balanceDue: number }) {
  return (
    <>
      <table className="estimate-table"><tbody>
        {estimate.lines.map((l, i) => <tr key={i}><td>{l.label}<br /><span className="muted small">{l.detail}</span></td><td className="num">{money(l.amount)}</td></tr>)}
      </tbody></table>
      <p>{estimate.totalFeet} ft of lighting • {estimate.bulbCount} bulbs</p>
      <p className="total-row"><span>Contract total</span><span>{money(estimate.total)}</span></p>
      <p className="total-row deposit"><span>Deposit due at signing (50%)</span><span>{money(estimate.depositDue)}</span></p>
      <p className="total-row"><span>Balance due on completion</span><span>{money(balanceDue)}</span></p>
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
    const message = `Hi ${signed.customerName}, here is your signed holiday lighting agreement with ${signed.businessName}. Total ${money(signed.estimate.total)}, deposit ${money(signed.estimate.depositDue)}. Thank you!`;
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

  const estimate = signed?.estimate ?? liveEstimate;
  const balanceDue = signed?.balanceDue ?? round2(liveEstimate.total - liveEstimate.depositDue);
  const businessName = signed?.businessName ?? user?.name ?? '';
  const canSign = !signed && Boolean(terms) && customerName.trim() !== '' && Boolean(signature) && agreed && !busy && liveEstimate.total > 0;

  const sign = async () => {
    if (!canSign || !signature) return;
    setBusy(true); setError(null);
    try {
      const { project: p } = await api.signContract(project.id, { customerName, customerPhone, customerEmail, signatureDataUrl: signature, agreed });
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
        {signed && <button className="primary" onClick={() => { void send(); }} disabled={!pdf}>{pdf ? 'Send to customer' : 'Preparing PDF…'}</button>}
        {signed && <button onClick={download} disabled={!pdf}>Download PDF</button>}
        {signed && <button onClick={() => window.print()}>Print</button>}
        {signed && <button className="danger" onClick={() => { void voidIt(); }}>Void contract</button>}
      </div>
      {signed && <p className="signed-banner no-print">✓ Signed by {signed.customerName} on {fmtDate(signed.signedAt)} at {fmtTime(signed.signedAt)}</p>}
      {sendNote && <p className="send-note no-print">{sendNote}</p>}
      {pdfError && <p className="error no-print">{pdfError}</p>}
      {error && <p className="error no-print">{error}</p>}

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
        <PriceTable estimate={estimate} balanceDue={balanceDue} />

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
              <span>I have read and agree to this agreement, including the {money(estimate.total)} total and the {money(estimate.depositDue)} deposit, and I agree to sign it electronically.</span>
            </label>
            {liveEstimate.total <= 0 && <p className="error">This quote has no priced lighting yet. Trace and calibrate the design first.</p>}
            <button className="primary big" onClick={() => { void sign(); }} disabled={!canSign}>{busy ? 'Signing…' : 'Sign contract'}</button>
            {!canSign && !busy && liveEstimate.total > 0 && (
              <p className="muted small">{!customerName.trim() ? 'Enter the customer’s name. ' : ''}{!signature ? 'Sign in the box. ' : ''}{!agreed ? 'Tick the box to agree.' : ''}</p>
            )}
          </div>
        )}
      </section>
    </div>
  );
}
