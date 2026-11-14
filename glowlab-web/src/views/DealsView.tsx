import { useEffect, useState } from 'react';
import type { Project } from '@glowlab/shared';
import { getPreset, money, round2 } from '@glowlab/shared';
import { api } from '../api';

/** The Projects tab: closed deals (signed contracts), newest first, with totals. */
export default function DealsView({ onOpen }: { onOpen: (p: Project) => void }) {
  const [deals, setDeals] = useState<Project[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [opening, setOpening] = useState<string | null>(null);

  useEffect(() => {
    api.listProjects()
      .then(({ projects }) => setDeals(projects
        .filter((p) => p.status === 'won' && p.contract)
        .sort((a, b) => (b.contract!.signedAt).localeCompare(a.contract!.signedAt))))
      .catch((e: Error) => setError(e.message));
  }, []);

  const open = async (id: string) => {
    setOpening(id);
    try { onOpen((await api.getProject(id)).project); } catch (e) { setError((e as Error).message); setOpening(null); }
  };

  const sum = (f: (p: Project) => number) => round2((deals ?? []).reduce((n, p) => n + f(p), 0));
  const value = sum((p) => p.contract!.estimate.total);
  const deposits = sum((p) => p.contract!.estimate.depositDue);
  const balance = sum((p) => p.contract!.balanceDue);

  return (
    <div>
      <h2>Projects</h2>
      <p className="muted">Closed deals: every quote that has a signed contract.</p>
      {error && <p className="error">{error}</p>}
      {!deals && !error && <p className="muted">Loading…</p>}
      {deals && (
        <div className="stat-row">
          <div className="stat"><span className="stat-label">Closed deals</span><strong>{deals.length}</strong></div>
          <div className="stat"><span className="stat-label">Contract value</span><strong>{money(value)}</strong></div>
          <div className="stat"><span className="stat-label">Deposits (50%)</span><strong>{money(deposits)}</strong></div>
          <div className="stat"><span className="stat-label">Balance on completion</span><strong>{money(balance)}</strong></div>
        </div>
      )}
      {deals?.length === 0 && (
        <p className="muted">No signed contracts yet. Open a quote on the Quotes tab and tap <strong>Sign contract</strong> to close your first deal.</p>
      )}
      <ul className="deal-list">
        {deals?.map((p) => {
          const c = p.contract!;
          return (
            <li key={p.id} className="deal">
              <div className="deal-main">
                <strong>{p.clientName}</strong>
                <span className="muted small">{p.address || 'No address'}</span>
                <span className="small">{getPreset(p.presetId)?.name ?? c.presetName} • signed {new Date(c.signedAt).toLocaleDateString()} by {c.customerName}</span>
              </div>
              <div className="deal-money">
                <strong>{money(c.estimate.total)}</strong>
                <span className="muted small">deposit {money(c.estimate.depositDue)}</span>
              </div>
              <button onClick={() => { void open(p.id); }} disabled={opening !== null}>{opening === p.id ? 'Opening…' : 'View contract'}</button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
