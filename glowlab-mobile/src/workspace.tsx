import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import type { Preset, PricingSettings, Project } from '@glowlab/shared';
import { DEFAULT_PRICING } from '@glowlab/shared';
import { api, projectInput } from './api';
import { useAuth } from './auth';

/** Shared draft state: the project currently open in Designer/Estimate. */
interface Workspace {
  projects: Project[];
  presets: Preset[];
  settings: PricingSettings;
  current: Project | null;
  setCurrent: (p: Project | null) => void;
  updateCurrent: (p: Project) => void;
  reload: () => Promise<void>;
  saveCurrent: () => Promise<void>;
  /** True when the open project has changes that aren't saved yet. */
  dirty: boolean;
  /** Saves the open project if it has unsaved changes. */
  saveIfDirty: () => Promise<void>;
  refreshSettings: () => Promise<void>;
}

const Ctx = createContext<Workspace | null>(null);

export function WorkspaceProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [projects, setProjects] = useState<Project[]>([]);
  const [presets, setPresets] = useState<Preset[]>([]);
  const [settings, setSettings] = useState<PricingSettings>(DEFAULT_PRICING);
  const [current, setCurrentState] = useState<Project | null>(null);
  const [dirty, setDirty] = useState(false);

  const reload = useCallback(async () => {
    if (!user) return;
    const [{ projects: ps }, { presets: pr }, { settings: s }] = await Promise.all([api.listProjects(), api.presets(), api.getSettings()]);
    setProjects(ps); setPresets(pr); setSettings(s);
  }, [user]);

  useEffect(() => { reload().catch(() => undefined); }, [reload]);

  const refreshSettings = useCallback(async () => {
    const { settings: s } = await api.getSettings();
    setSettings(s);
  }, []);

  const setCurrent = (p: Project | null) => { setCurrentState(p); setDirty(false); };
  const updateCurrent = (p: Project) => { setCurrentState(p); setDirty(true); };
  const saveCurrent = async () => {
    if (!current) return;
    const { project } = await api.updateProject(current.id, projectInput(current));
    setCurrentState(project); setDirty(false);
    setProjects((prev) => prev.map((x) => (x.id === project.id ? project : x)));
  };
  const saveIfDirty = async () => { if (dirty) await saveCurrent(); };

  return <Ctx.Provider value={{ projects, presets, settings, current, setCurrent, updateCurrent, reload, saveCurrent, refreshSettings, dirty, saveIfDirty }}>{children}</Ctx.Provider>;
}

export function useWorkspace(): Workspace {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useWorkspace must be used inside WorkspaceProvider');
  return ctx;
}
