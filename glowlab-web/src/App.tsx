import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import type { Preset, PricingSettings, Project } from '@glowlab/shared';
import { AuthProvider, useAuth } from './auth';
import { api } from './api';
import ProjectsView from './views/ProjectsView';
import DesignerView from './views/DesignerView';
import SettingsView from './views/SettingsView';
import QuoteView from './views/QuoteView';
import ContractView from './views/ContractView';
import DealsView from './views/DealsView';
import UpdateBanner from './UpdateBanner';
import ErrorBoundary from './ErrorBoundary';

/** Designs = every design/estimate; Quotes = one quote at a time; Projects = closed deals (signed contracts). */
type Tab = 'projects' | 'quotes' | 'deals' | 'settings';

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
        <h1 className="brand"><img src="/icon-192.png" alt="" className="brand-mark" />GlowLab</h1>
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

const ICONS: Record<Tab, JSX.Element> = {
  projects: <path d="M4 20h4L19 9l-4-4L4 16v4zM14 6l4 4" />,
  quotes: <><path d="M7 3h7l5 5v13H7z" /><path d="M14 3v5h5M10 13h6M10 17h6" /></>,
  deals: <><path d="M4 12.5 9 17.5 20 6.5" /></>,
  settings: <><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" /></>,
};
const TABS: { id: Tab; label: string }[] = [
  { id: 'projects', label: 'Designs' },
  { id: 'quotes', label: 'Quotes' },
  { id: 'deals', label: 'Projects' },
  { id: 'settings', label: 'Settings' },
];

function Shell() {
  const { user, loading } = useAuth();
  const [tab, setTab] = useState<Tab>('projects');
  const [open, setOpen] = useState<Project | null>(null);
  const [quoteProject, setQuoteProject] = useState<Project | null>(null);
  const [dealProject, setDealProject] = useState<Project | null>(null);
  const top = () => window.scrollTo({ top: 0, behavior: 'instant' as ScrollBehavior });
  const go = (t: Tab) => { setTab(t); setOpen(null); top(); };
  const showDeal = (p: Project) => { setDealProject(p); go('deals'); };
  // Tapping the tab you're already on goes back to that tab's main list.
  const tapTab = (t: Tab) => {
    if (t === 'deals' && (tab !== 'deals' || dealProject)) setDealProject(null);
    if (t === 'quotes' && tab === 'quotes' && !open) setQuoteProject(null);
    go(t);
  };
  const [presets, setPresets] = useState<Preset[]>([]);
  const [settings, setSettings] = useState<PricingSettings | null>(null);

  useEffect(() => {
    if (!user) return;
    api.presets().then(({ presets: ps }) => setPresets(ps)).catch(() => undefined);
    api.getSettings().then(({ settings: s }) => setSettings(s)).catch(() => undefined);
  }, [user]);

  if (loading) return <div className="boot"><img src="/icon-192.png" alt="" className="boot-mark" /></div>;
  if (!user) return <AuthScreen />;

  const activeTab: Tab = open ? 'projects' : tab;
  // Each screen gets its own key so switching screens plays the enter animation.
  const screenKey = open ? `design-${open.id}`
    : tab === 'quotes' ? `quotes-${quoteProject?.id ?? 'list'}`
    : tab === 'deals' ? `deals-${dealProject?.id ?? 'list'}`
    : tab;

  return (
    <div className="shell">
      <header className="no-print">
        <span className="logo brand"><img src="/icon-192.png" alt="" className="brand-mark" />GlowLab</span>
        <nav className="tabbar" aria-label="Main">
          {TABS.map(({ id, label }) => (
            <button key={id} className={activeTab === id ? 'nav active' : 'nav'} aria-current={activeTab === id ? 'page' : undefined} onClick={() => tapTab(id)}>
              <svg className="nav-icon" viewBox="0 0 24 24" aria-hidden="true">{ICONS[id]}</svg>
              <span>{label}</span>
            </button>
          ))}
        </nav>
        <span className="muted small user-name">{user.name}</span>
      </header>
      <main>
        <div className="screen" key={screenKey}><ErrorBoundary>
          {open && settings ? (
            <DesignerView key={open.id} initial={open} presets={presets} settings={settings} onBack={() => { setOpen(null); top(); }}
              onQuote={(p) => { setQuoteProject(p); setOpen(null); setTab('quotes'); top(); }} />
          ) : open ? (
            <div className="spinner" aria-label="Loading" />
          ) : tab === 'quotes' ? (
            settings ? (
              <QuoteView project={quoteProject} presets={presets} settings={settings} onPick={(p) => { setQuoteProject(p); top(); }}
                onEdit={(p) => { setOpen(p); setTab('projects'); top(); }}
                onSigned={(p) => { setQuoteProject(null); showDeal(p); }} />
            ) : <div className="spinner" aria-label="Loading" />
          ) : tab === 'deals' ? (
            dealProject && settings ? (
              <ContractView key={dealProject.id} project={dealProject} presets={presets} settings={settings}
                onBack={() => { setDealProject(null); top(); }}
                onVoided={(p) => { setDealProject(null); setQuoteProject(p); go('quotes'); }} />
            ) : <DealsView onOpen={(p) => { setDealProject(p); top(); }} />
          ) : tab === 'projects' ? (
            <ProjectsView settings={settings} onOpen={(p) => { setOpen(p); top(); }} onOpenContract={showDeal} />
          ) : (
            <SettingsView initial={settings} onSaved={setSettings} />
          )}
        </ErrorBoundary></div>
      </main>
    </div>
  );
}

export default function App() {
  return <AuthProvider><Shell /><UpdateBanner /></AuthProvider>;
}
