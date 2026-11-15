import { useEffect, useState } from 'react';
import type { Preset, PricingSettings, Project } from '@glowlab/shared';
import { INSTALL_TYPE_LABELS, QUOTE_DISCLAIMER, computeEstimate, money, normalizeEstimateOptions, profileFor, rateCardFor } from '@glowlab/shared';
import { api, cachedProjects } from '../api';
import { useAuth } from '../auth';
import { HouseStage } from './DesignerView';
import ContractView from './ContractView';

/**
 * The Quote tab: the customer-facing quote for one project, on its own page.
 * With no project picked yet it lists projects to choose from.
 */
export default function QuoteView({ project, presets, settings, onPick, onEdit, onSigned, onClose }: {
  project: Project | null; presets: Preset[]; settings: PricingSettings;
  onPick: (p: Project) => void; onEdit: (p: Project) => void; onSigned: (p: Project) => void;
  /** Back to the list of quotes. */
  onClose: () => void;
}) {
  const { user } = useAuth();
  const [night, setNight] = useState(true);
  const [signing, setSigning] = useState(false);
  useEffect(() => { setSigning(false); }, [project?.id]);
  if (!project) return <QuotePicker onPick={onPick} />;
  const voided = (p: Project) => { setSigning(false); onPick(p); window.scrollTo(0, 0); };
  // A saved contract waiting for a signature opens straight to the contract.
  if (project.status === 'contract' && project.contract) {
    return <ContractView key={`${project.id}-saved`} project={project} presets={presets} settings={settings} backLabel="← All quotes"
      onBack={() => { setSigning(false); onClose(); window.scrollTo(0, 0); }} onSigned={onSigned} onSaved={onPick} onVoided={voided} />;
  }
  if (signing) {
    return <ContractView key={`${project.id}-draft`} project={project} presets={presets} settings={settings}
      onBack={() => { setSigning(false); window.scrollTo(0, 0); }} onSigned={onSigned} onSaved={onPick} />;
  }

  const preset = presets.find((p) => p.id === project.presetId) ?? presets[0];
  if (!preset) return <p className="muted">Loading…</p>;
  const opts = normalizeEstimateOptions(project.estimateOptions);
  const profile = profileFor(settings, opts);
  const estimate = computeEstimate(project, preset, settings, opts);

  return (
    <div>
      <div className="toolbar no-print">
        <button onClick={() => onEdit(project)}>← Edit design</button>
        <label className="toggle"><input type="checkbox" checked={night} onChange={(e) => setNight(e.target.checked)} /> Night mode</label>
        <button onClick={() => window.print()}>Print</button>
        <button className="primary cta" onClick={() => { setSigning(true); window.scrollTo(0, 0); }}
          title="Set the final price, then sign it here or save it to share and sign later">Create contract →</button>
      </div>
      {estimate.totalFeet === 0 && (
        <p className="error no-print">This project has no lit footage yet. Trace its lines and calibrate it in the designer to price it.</p>
      )}
      <section className="quote">
        <h2 className="brand"><img src="/icon-192.png" alt="" className="brand-mark" />{user?.name || 'GlowLab'}</h2>
        <h3 className="contract-title">Holiday Lighting Estimate</h3>
        <p><strong>{project.clientName}</strong>{project.address ? ` — ${project.address}` : ''}<br />
          Design: <strong>{preset.name}</strong> — {INSTALL_TYPE_LABELS[opts.installType]} ({opts.installType === 'permanent' ? 'permanent LED' : preset.bulbSize}, {profile.bulbSpacingInches}&quot; spacing)</p>
        <HouseStage project={project} preset={preset} spacingInches={profile.bulbSpacingInches} installType={opts.installType} night={night} />
        <table className="estimate-table"><tbody>
          {estimate.lines.map((l, i) => <tr key={i}><td>{l.label}<br /><span className="muted small">{l.detail}</span></td><td className="num">{money(l.amount)}</td></tr>)}
        </tbody></table>
        <p>{estimate.totalFeet} ft of lighting • {estimate.bulbCount} bulbs • {estimate.clipCount} clips</p>
        <p className="total-row"><span>Estimated total</span><span>{money(estimate.total)}</span></p>
        <p className="total-row deposit"><span>Deposit due to book (50%)</span><span>{money(estimate.depositDue)}</span></p>
        <p className="muted small">{opts.installType === 'permanent'
          ? 'Permanent lighting is installed once and stays up year-round.'
          : rateCardFor(settings, opts).takedownReinstallFee > 0
            ? 'Seasonal lighting is hung for the holidays; takedown / reinstall is listed above.'
            : 'Seasonal lighting includes installation and takedown after the holidays.'} Estimate based on the traced design above; final footage confirmed on install day.</p>
        <p className="quote-disclaimer"><strong>Please note:</strong> {QUOTE_DISCLAIMER}</p>
        <div className="sign-block">
          <p className="sign-intro">By signing below, the customer accepts this estimate and agrees to the 50% deposit of <strong>{money(estimate.depositDue)}</strong> to book the installation.</p>
          <div className="sign-grid">
            <div className="sign-field sign-wide"><span className="sign-line" /><span className="sign-label">Customer signature</span></div>
            <div className="sign-field"><span className="sign-line" /><span className="sign-label">Date</span></div>
            <div className="sign-field sign-wide"><span className="sign-line" /><span className="sign-label">Printed name</span></div>
            <div className="sign-field"><span className="sign-line" /><span className="sign-label">Phone</span></div>
            <div className="sign-field sign-wide"><span className="sign-line" /><span className="sign-label">Company representative</span></div>
            <div className="sign-field"><span className="sign-line" /><span className="sign-label">Date</span></div>
          </div>
          <p className="sign-issued muted small">Estimate prepared {new Date().toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' })}</p>
        </div>
      </section>
    </div>
  );
}

function QuotePicker({ onPick }: { onPick: (p: Project) => void }) {
  const [projects, setProjects] = useState<Project[] | null>(() => cachedProjects()?.filter((p) => p.status !== 'won') ?? null);
  const [error, setError] = useState<string | null>(null);
  const [opening, setOpening] = useState<string | null>(null);

  useEffect(() => {
    // Signed jobs live on the Projects tab, so only open quotes are listed here.
    api.listProjects().then(({ projects: ps }) => setProjects(ps.filter((p) => p.status !== 'won'))).catch((e) => setError((e as Error).message));
  }, []);

  const pick = async (id: string) => {
    setOpening(id);
    try { onPick((await api.getProject(id)).project); } catch (e) { setError((e as Error).message); setOpening(null); }
  };

  return (
    <div>
      <h2>Quotes</h2>
      <p className="muted">Pick a project to see its quote, or open a project and click <strong>Quote view</strong>.</p>
      {error && <p className="error">{error}</p>}
      {!projects && !error && <div className="spinner" aria-label="Loading" />}
      {projects?.length === 0 && <p className="muted">No open quotes. Start a design on the Designs tab.</p>}
      <ul className="line-list">
        {projects?.map((p) => (
          <li key={p.id} className="tappable" onClick={() => { if (opening === null) void pick(p.id); }}>
            <span style={{ flex: 1, minWidth: 0 }}><strong>{p.clientName || 'Untitled'}</strong>{p.address ? <span className="muted small"> — {p.address}</span> : null}
              {p.status === 'contract' && <><br /><span className="badge pending">Contract out for signature</span></>}</span>
            <button onClick={(e) => { e.stopPropagation(); void pick(p.id); }} disabled={opening !== null}>{opening === p.id ? 'Opening…' : p.status === 'contract' ? 'View contract' : 'View quote'}</button>
          </li>
        ))}
      </ul>
    </div>
  );
}
