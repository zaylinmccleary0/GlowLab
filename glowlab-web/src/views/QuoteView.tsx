import { useEffect, useState } from 'react';
import type { Preset, PricingSettings, Project } from '@glowlab/shared';
import { INSTALL_TYPE_LABELS, QUOTE_DISCLAIMER, computeEstimate, money, normalizeEstimateOptions, profileFor, rateCardFor } from '@glowlab/shared';
import { api } from '../api';
import { HouseStage } from './DesignerView';

/**
 * The Quote tab: the customer-facing quote for one project, on its own page.
 * With no project picked yet it lists projects to choose from.
 */
export default function QuoteView({ project, presets, settings, onPick, onEdit }: {
  project: Project | null; presets: Preset[]; settings: PricingSettings;
  onPick: (p: Project) => void; onEdit: (p: Project) => void;
}) {
  const [night, setNight] = useState(true);
  if (!project) return <QuotePicker onPick={onPick} />;

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
        <button className="primary" onClick={() => window.print()}>Print quote</button>
      </div>
      {estimate.totalFeet === 0 && (
        <p className="error no-print">This project has no lit footage yet. Trace its lines and calibrate it in the designer to price it.</p>
      )}
      <section className="quote">
        <h2 className="brand"><img src="/icon-192.png" alt="" className="brand-mark" />GlowLab — Holiday Lighting Estimate</h2>
        <p><strong>{project.clientName}</strong>{project.address ? ` — ${project.address}` : ''}<br />
          Design: <strong>{preset.name}</strong> — {INSTALL_TYPE_LABELS[opts.installType]} ({opts.installType === 'permanent' ? 'permanent LED' : preset.bulbSize}, {profile.bulbSpacingInches}&quot; spacing)</p>
        <HouseStage project={project} preset={preset} spacingInches={profile.bulbSpacingInches} installType={opts.installType} night={night} />
        <table className="estimate-table"><tbody>
          {estimate.lines.map((l, i) => <tr key={i}><td>{l.label}<br /><span className="muted small">{l.detail}</span></td><td className="num">{money(l.amount)}</td></tr>)}
        </tbody></table>
        <p>{estimate.totalFeet} ft of lighting • {estimate.bulbCount} bulbs • {estimate.clipCount} clips</p>
        <p className="total-row"><span>Total</span><span>{money(estimate.total)}</span></p>
        <p className="total-row deposit"><span>Deposit due to book (50%)</span><span>{money(estimate.depositDue)}</span></p>
        <p className="muted small">{opts.installType === 'permanent'
          ? 'Permanent lighting is installed once and stays up year-round.'
          : rateCardFor(settings, opts).takedownReinstallFee > 0
            ? 'Seasonal lighting is hung for the holidays; takedown / reinstall is listed above.'
            : 'Seasonal lighting includes installation and takedown after the holidays.'} Estimate based on the traced design above; final footage confirmed on install day.</p>
        <p className="quote-disclaimer"><strong>Please note:</strong> {QUOTE_DISCLAIMER}</p>
      </section>
    </div>
  );
}

function QuotePicker({ onPick }: { onPick: (p: Project) => void }) {
  const [projects, setProjects] = useState<Project[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [opening, setOpening] = useState<string | null>(null);

  useEffect(() => {
    api.listProjects().then(({ projects: ps }) => setProjects(ps)).catch((e) => setError((e as Error).message));
  }, []);

  const pick = async (id: string) => {
    setOpening(id);
    try { onPick((await api.getProject(id)).project); } catch (e) { setError((e as Error).message); setOpening(null); }
  };

  return (
    <div>
      <h1>Quotes</h1>
      <p className="muted">Pick a project to see its quote, or open a project and click <strong>Quote view</strong>.</p>
      {error && <p className="error">{error}</p>}
      {!projects && !error && <p className="muted">Loading…</p>}
      {projects?.length === 0 && <p className="muted">No projects yet. Start one on the Projects tab.</p>}
      <ul className="line-list">
        {projects?.map((p) => (
          <li key={p.id}>
            <span style={{ flex: 1 }}><strong>{p.clientName || 'Untitled'}</strong>{p.address ? <span className="muted small"> — {p.address}</span> : null}</span>
            <button onClick={() => { void pick(p.id); }} disabled={opening !== null}>{opening === p.id ? 'Opening…' : 'View quote'}</button>
          </li>
        ))}
      </ul>
    </div>
  );
}
