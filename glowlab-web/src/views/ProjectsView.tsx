import { useCallback, useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import type { PricingSettings, Project } from '@glowlab/shared';
import { DEFAULT_ESTIMATE_OPTIONS, computeEstimate, getPreset, money } from '@glowlab/shared';
import { api } from '../api';

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
        clientName, address, photoDataUrl: null, imageWidth: 1000, imageHeight: 600,
        calibration: null, lines: [], presetId: 'classic-warm-white', estimateOptions: DEFAULT_ESTIMATE_OPTIONS,
      });
      setClientName(''); setAddress('');
      onOpen(project);
    } catch (err) { setError((err as Error).message); }
  };

  const del = async (id: string) => { await api.deleteProject(id); load(); };

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
        {projects.map((p) => {
          const preset = getPreset(p.presetId);
          const est = preset && settings ? computeEstimate(p, preset, settings, p.estimateOptions) : null;
          return (
            <div key={p.id} className="card">
              <div className="card-head"><span className="card-title">{p.clientName}</span>
                <button className="icon" title="Delete" onClick={() => del(p.id)}>✕</button></div>
              <span className="muted small">{p.address || 'No address'}</span>
              <span className="badge">{preset?.name ?? p.presetId}</span>
              <span className="muted small">{p.lines.length} line(s){est ? ` • ${est.totalFeet} ft • ${money(est.total)}` : ''}</span>
              <button className="primary" onClick={() => onOpen(p)}>Open designer</button>
            </div>
          );
        })}
        {projects.length === 0 && <p className="muted">No projects yet — create your first estimate above.</p>}
      </div>
    </div>
  );
}
