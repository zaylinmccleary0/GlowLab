import { useEffect, useState } from 'react';
import type { InstallType, PricingProfile, PricingSettings, RateCard } from '@glowlab/shared';
import { INSTALL_TYPE_LABELS, MAX_PRICING_PROFILES, RATE_CARD_FIELDS, newPricingProfile, validatePricingSettings } from '@glowlab/shared';
import { api } from '../api';
import { useAuth } from '../auth';
import NumberField from '../NumberField';

const newId = () => `list-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;

export default function SettingsView({ onSaved }: { onSaved: (s: PricingSettings) => void }) {
  const { user, logout } = useAuth();
  const [settings, setSettings] = useState<PricingSettings | null>(null);
  const [activeId, setActiveId] = useState<string>('');
  const [type, setType] = useState<InstallType>('seasonal');
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.getSettings().then(({ settings: s }) => { setSettings(s); setActiveId(s.profiles[0].id); }).catch((e: Error) => setError(e.message));
  }, []);
  if (!settings) return <p className="muted">{error ?? 'Loading…'}</p>;

  const active = settings.profiles.find((p) => p.id === activeId) ?? settings.profiles[0];
  const updateActive = (patch: Partial<PricingProfile>) =>
    setSettings({ profiles: settings.profiles.map((p) => (p.id === active.id ? { ...p, ...patch } : p)) });
  const setRate = (key: keyof RateCard, v: number) => updateActive({ [type]: { ...active[type], [key]: v } } as Partial<PricingProfile>);

  const addList = () => {
    if (settings.profiles.length >= MAX_PRICING_PROFILES) return;
    // Start from a copy of the list you're looking at, so small variations are quick.
    const copy: PricingProfile = { ...structuredClone(active), id: newId(), name: `Price list ${settings.profiles.length + 1}` };
    setSettings({ profiles: [...settings.profiles, copy] });
    setActiveId(copy.id);
  };
  const removeActive = () => {
    if (settings.profiles.length <= 1) return;
    if (!window.confirm(`Delete the "${active.name}" price list? Estimates using it switch to "${settings.profiles.find((p) => p.id !== active.id)?.name}".`)) return;
    const rest = settings.profiles.filter((p) => p.id !== active.id);
    setSettings({ profiles: rest });
    setActiveId(rest[0].id);
  };
  const resetActive = () => {
    const fresh = newPricingProfile(active.id, active.name);
    updateActive({ bulbSpacingInches: fresh.bulbSpacingInches, seasonal: fresh.seasonal, permanent: fresh.permanent });
  };
  const makeDefault = () => {
    setSettings({ profiles: [active, ...settings.profiles.filter((p) => p.id !== active.id)] });
  };

  const save = async () => {
    setError(null);
    const { settings: clean, error: invalid } = validatePricingSettings(settings);
    if (!clean) { setError(invalid ?? 'Check the prices'); return; }
    try {
      const { settings: s } = await api.saveSettings(clean);
      setSettings(s); onSaved(s); setSaved(true); setTimeout(() => setSaved(false), 2000);
    } catch (e) { setError((e as Error).message); }
  };

  const isDefault = settings.profiles[0].id === active.id;

  return (
    <div className="settings">
      <h2>Pricing settings</h2>
      <p className="muted">Signed in as {user?.name} ({user?.email}). Save up to {MAX_PRICING_PROFILES} price lists and pick one on each estimate.</p>

      <div className="chips wrap" role="tablist" aria-label="Price lists">
        {settings.profiles.map((p, i) => (
          <button key={p.id} role="tab" aria-selected={p.id === active.id} className={p.id === active.id ? 'chip active' : 'chip'} onClick={() => setActiveId(p.id)}>
            {p.name || 'Untitled'}{i === 0 ? ' ★' : ''}
          </button>
        ))}
        {settings.profiles.length < MAX_PRICING_PROFILES && <button className="chip" onClick={addList}>+ Add price list</button>}
      </div>

      <div className="form narrow">
        <label>Price list name
          <input maxLength={40} value={active.name} onChange={(e) => updateActive({ name: e.target.value })} placeholder="e.g. Standard, Premium, Friends & family" />
          <span className="muted small">{isDefault ? '★ Default — new estimates use this list.' : <button type="button" className="link" onClick={makeDefault}>Make this the default list</button>}</span>
        </label>
        <label>Bulb spacing (inches)
          <NumberField value={active.bulbSpacingInches} onChange={(v) => updateActive({ bulbSpacingInches: v })} />
          <span className="muted small">Distance between bulbs. Sets the bulb count and how the lights are drawn.</span>
        </label>

        <div className="chips" role="tablist" aria-label="Install type">
          {(['seasonal', 'permanent'] as const).map((t) => (
            <button key={t} type="button" role="tab" aria-selected={type === t} className={type === t ? 'chip active' : 'chip'} onClick={() => setType(t)}>
              {INSTALL_TYPE_LABELS[t]}
            </button>
          ))}
        </div>
        <p className="muted small" style={{ marginTop: -4 }}>
          {type === 'seasonal' ? 'Seasonal: hung for the holidays, taken down after.' : 'Permanent: year-round LED track lighting.'} Editing {INSTALL_TYPE_LABELS[type].toLowerCase()} prices for “{active.name || 'Untitled'}”.
        </p>
        {RATE_CARD_FIELDS.map(({ key, label, hint }) => (
          <label key={`${active.id}-${type}-${key}`}>{label}
            <NumberField value={active[type][key]} onChange={(v) => setRate(key, v)} />
            {hint && <span className="muted small">{hint}</span>}
          </label>
        ))}

        {error && <p className="error">{error}</p>}
        <div className="toolbar">
          <button className="primary" onClick={save}>{saved ? 'Saved ✓' : 'Save pricing'}</button>
          <button type="button" onClick={resetActive}>Reset this list to defaults</button>
          {settings.profiles.length > 1 && <button type="button" className="danger" onClick={removeActive}>Delete this list</button>}
        </div>
      </div>
      <button className="danger" onClick={logout}>Log out</button>
    </div>
  );
}
