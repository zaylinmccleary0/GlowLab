import { useEffect, useState } from 'react';
import type { PricingSettings } from '@glowlab/shared';
import { api } from '../api';
import { useAuth } from '../auth';

const FIELDS: { key: keyof PricingSettings; label: string; hint: string }[] = [
  { key: 'baseRatePerFoot', label: 'Base rate per foot ($)', hint: 'Rental rate; install + takedown included' },
  { key: 'purchaseMultiplier', label: 'Purchase multiplier', hint: 'Applied when the client buys the lights outright' },
  { key: 'secondStoryMultiplier', label: 'Second-story multiplier', hint: 'Applied to the per-foot charge for 2-story homes' },
  { key: 'steepRoofFee', label: 'Steep roof fee ($, flat)', hint: 'Added once for steep / difficult roofs' },
  { key: 'wreathPrice', label: 'Wreath ($ each)', hint: '' },
  { key: 'pathwayStakePrice', label: 'Pathway stake ($ each)', hint: '' },
  { key: 'treeWrapPrice', label: 'Tree wrap ($ each)', hint: '' },
  { key: 'timerPrice', label: 'Timer ($ each)', hint: '' },
];

export default function SettingsView({ onSaved }: { onSaved: (s: PricingSettings) => void }) {
  const { user, logout } = useAuth();
  const [settings, setSettings] = useState<PricingSettings | null>(null);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => { api.getSettings().then(({ settings: s }) => setSettings(s)).catch((e: Error) => setError(e.message)); }, []);
  if (!settings) return <p className="muted">{error ?? 'Loading…'}</p>;

  const save = async () => {
    try {
      const { settings: s } = await api.saveSettings(settings);
      setSettings(s); onSaved(s); setSaved(true); setTimeout(() => setSaved(false), 2000);
    } catch (e) { setError((e as Error).message); }
  };

  return (
    <div className="settings">
      <h2>Pricing settings</h2>
      <p className="muted">Signed in as {user?.name} ({user?.email}). These rates drive every estimate.</p>
      <div className="form narrow">
        {FIELDS.map(({ key, label, hint }) => (
          <label key={key}>{label}
            <input type="number" step="0.01" min="0" value={settings[key]}
              onChange={(e) => setSettings({ ...settings, [key]: Number(e.target.value) || 0 })} />
            {hint && <span className="muted small">{hint}</span>}
          </label>
        ))}
        {error && <p className="error">{error}</p>}
        <button className="primary" onClick={save}>{saved ? 'Saved ✓' : 'Save pricing'}</button>
      </div>
      <button className="danger" onClick={logout}>Log out</button>
    </div>
  );
}
