import { useCallback, useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import type { LineKind, PricingSettings, Project } from '@glowlab/shared';
import {
  DEFAULT_ESTIMATE_OPTIONS, DEFAULT_PRICING, INSTALL_TYPE_LABELS, computeEstimate, getPreset, lineLengthsFeet, money,
  normalizeEstimateOptions, profileFor,
} from '@glowlab/shared';
import { api } from '../api';
import { HouseStage } from './DesignerView';

/** Feet traced per kind of line, e.g. [['roofline', 62.4], ['gutter', 30.1]]. */
function feetByKind(p: Project): [LineKind, number][] {
  const lengths = lineLengthsFeet(p);
  const totals = new Map<LineKind, number>();
  for (const l of p.lines) totals.set(l.kind, (totals.get(l.kind) ?? 0) + (lengths[l.id] ?? 0));
  return [...totals.entries()];
}

function ProjectCard({ p, settings, onOpen, onDelete }: {
  p: Project; settings: PricingSettings; onOpen: () => void; onDelete: () => void;
}) {
  const preset = getPreset(p.presetId);
  const opts = normalizeEstimateOptions(p.estimateOptions);
  const profile = profileFor(settings, opts);
  const est = preset ? computeEstimate(p, preset, settings, opts) : null;
  const kinds = feetByKind(p);
  // The list carries a small preview of the photo; show it with the lights drawn on.
  const missingPreview = p.hasPhoto && !p.thumbDataUrl;

  return (
    <div className="card project-card">
      <div className="card-preview" onClick={onOpen} role="button" tabIndex={0} title="Open designer"
        onKeyDown={(e) => { if (e.key === 'Enter') onOpen(); }}>
        {missingPreview || !preset ? (
          <div className="card-preview-empty">Photo saved — open once to make its preview</div>
        ) : (
          <HouseStage project={{ ...p, photoDataUrl: p.thumbDataUrl ?? null }} preset={preset}
            spacingInches={profile.bulbSpacingInches} installType={opts.installType} night />
        )}
      </div>
      <div className="card-head"><span className="card-title">{p.clientName}</span>
        <button className="icon" title="Delete" onClick={onDelete}>✕</button></div>
      <span className="muted small">{p.address || 'No address'}</span>
      <div className="chips wrap">
        <span className="badge">{preset?.name ?? p.presetId}</span>
        <span className="badge alt">{INSTALL_TYPE_LABELS[opts.installType]}</span>
        {settings.profiles.length > 1 && <span className="badge alt">{profile.name}</span>}
      </div>
      {p.lines.length === 0 ? (
        <span className="muted small">No lines traced yet</span>
      ) : !p.calibration ? (
        <span className="muted small">{p.lines.length} line(s) traced — not calibrated yet, so no feet or price</span>
      ) : (
        <>
          <ul className="card-lines">
            {kinds.map(([k, ft]) => <li key={k}><span>{k}</span><span>{ft.toFixed(1)} ft</span></li>)}
          </ul>
          {est && (
            <div className="card-total">
              <span className="muted small">{est.totalFeet} ft lit • {est.bulbCount} bulbs</span>
              <strong>{money(est.total)}</strong>
            </div>
          )}
        </>
      )}
      <button className="primary" onClick={onOpen}>Open designer</button>
    </div>
  );
}

export default function ProjectsView({ settings, onOpen }: { settings: PricingSettings | null; onOpen: (p: Project) => void }) {
  const [projects, setProjects] = useState<Project[]>([]);
  const [clientName, setClientName] = useState('');
  const [address, setAddress] = useState('');
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => { api.listProjects().then(({ projects: ps }) => setProjects(ps)).catch((e: Error) => setError(e.message)); }, []);
  useEffect(load, [load]);

  const create = async (e: FormEvent) => {
    e.preventDefault();
    try {
      const { project } = await api.createProject({
        clientName, address, photoDataUrl: null, thumbDataUrl: null, imageWidth: 1000, imageHeight: 600,
        calibration: null, lines: [], presetId: 'classic-warm-white', estimateOptions: DEFAULT_ESTIMATE_OPTIONS,
      });
      setClientName(''); setAddress('');
      onOpen(project);
    } catch (err) { setError((err as Error).message); }
  };

  const del = async (p: Project) => {
    if (!window.confirm(`Delete the project for ${p.clientName}? This can't be undone.`)) return;
    await api.deleteProject(p.id); load();
  };
  // The list has no full-size photos (keeps it small), so load the full project before opening it.
  const open = async (id: string) => {
    try { const { project } = await api.getProject(id); onOpen(project); }
    catch (err) { setError((err as Error).message); }
  };

  return (
    <div>
      <h2>Projects</h2>
      <form className="form narrow" onSubmit={create}>
        <div className="row">
          <label>Client name<input required value={clientName} onChange={(e) => setClientName(e.target.value)} placeholder="The Johnsons" /></label>
          <label>Address<input value={address} onChange={(e) => setAddress(e.target.value)} placeholder="123 Candy Cane Ln" /></label>
        </div>
        <button className="primary" type="submit">+ New estimate</button>
      </form>
      {error && <p className="error">{error}</p>}
      <div className="grid" style={{ marginTop: 16 }}>
        {projects.map((p) => (
          <ProjectCard key={p.id} p={p} settings={settings ?? DEFAULT_PRICING} onOpen={() => open(p.id)} onDelete={() => del(p)} />
        ))}
        {projects.length === 0 && <p className="muted">No projects yet — create your first estimate above.</p>}
      </div>
    </div>
  );
}
