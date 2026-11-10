import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import type { Preset, PricingSettings, Project } from '@glowlab/shared';
import { AuthProvider, useAuth } from './auth';
import { api } from './api';
import ProjectsView from './views/ProjectsView';
import DesignerView from './views/DesignerView';
import SettingsView from './views/SettingsView';

type Tab = 'projects' | 'settings';

function AuthScreen() {
  const { login, register } = useAuth();
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault(); setBusy(true); setError(null);
    try {
      if (mode === 'login') await login(email, password);
      else await register(name, email, password);
    } catch (err) { setError((err as Error).message); setBusy(false); }
  };

  return (
    <div className="auth-wrap">
      <div className="auth-card">
        <h1>✨ GlowLab</h1>
        <p className="muted">Photograph the house, trace the lines, show the glow, quote the job.</p>
        <form onSubmit={submit} className="form">
          {mode === 'register' && <label>Business / your name<input required value={name} onChange={(e) => setName(e.target.value)} placeholder="Bright Nights Lighting" /></label>}
          <label>Email<input required type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" /></label>
          <label>Password<input required type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" /></label>
          {error && <p className="error">{error}</p>}
          <button className="primary" type="submit" disabled={busy}>{busy ? '…' : mode === 'login' ? 'Log in' : 'Create account'}</button>
        </form>
        <button className="link" onClick={() => setMode(mode === 'login' ? 'register' : 'login')}>
          {mode === 'login' ? 'No account yet? Create one' : 'Already have an account? Log in'}
        </button>
      </div>
    </div>
  );
}

function Shell() {
  const { user, loading } = useAuth();
  const [tab, setTab] = useState<Tab>('projects');
  const [open, setOpen] = useState<Project | null>(null);
  const [presets, setPresets] = useState<Preset[]>([]);
  const [settings, setSettings] = useState<PricingSettings | null>(null);

  useEffect(() => {
    if (!user) return;
    api.presets().then(({ presets: ps }) => setPresets(ps)).catch(() => undefined);
    api.getSettings().then(({ settings: s }) => setSettings(s)).catch(() => undefined);
  }, [user]);

  if (loading) return <p className="muted center">Loading…</p>;
  if (!user) return <AuthScreen />;

  return (
    <div className="shell">
      <header className="no-print">
        <span className="logo">✨ GlowLab</span>
        <nav>
          <button className={tab === 'projects' && !open ? 'nav active' : 'nav'} onClick={() => { setTab('projects'); setOpen(null); }}>Projects</button>
          <button className={tab === 'settings' ? 'nav active' : 'nav'} onClick={() => { setTab('settings'); setOpen(null); }}>Settings</button>
        </nav>
        <span className="muted small">{user.name}</span>
      </header>
      <main>
        {open && settings ? (
          <DesignerView key={open.id} initial={open} presets={presets} settings={settings} onBack={() => setOpen(null)} />
        ) : tab === 'projects' ? (
          <ProjectsView settings={settings} onOpen={setOpen} />
        ) : (
          <SettingsView onSaved={setSettings} />
        )}
      </main>
    </div>
  );
}

export default function App() {
  return <AuthProvider><Shell /></AuthProvider>;
}
