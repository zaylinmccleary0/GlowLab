import type { EstimateBreakdown, EstimateOptions, Preset, PricingSettings, Project, PublicUser, SignContractInput } from '@glowlab/shared';

const TOKEN_KEY = 'glowlab.token';
let projectsCache: Project[] | null = null;
/** The project list from the last load (null before the first), so a tab can show it instantly while it refreshes. */
export function cachedProjects(): Project[] | null { return projectsCache; }
export function getToken(): string | null { return localStorage.getItem(TOKEN_KEY); }
export function setToken(token: string | null): void {
  projectsCache = null;
  if (token) localStorage.setItem(TOKEN_KEY, token); else localStorage.removeItem(TOKEN_KEY);
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = getToken();
  const res = await fetch(path, {
    ...options,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(options.headers ?? {}) },
  });
  const data = (await res.json().catch(() => ({}))) as { error?: string } & T;
  if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
  return data;
}

export interface AuthResponse { token: string; user: PublicUser; }
export type ProjectInput = Omit<Project, 'id' | 'createdAt' | 'updatedAt' | 'status' | 'contract' | 'signatureDataUrl'>;

export const api = {
  register: (name: string, email: string, password: string) =>
    request<AuthResponse>('/api/auth/register', { method: 'POST', body: JSON.stringify({ name, email, password }) }),
  login: (email: string, password: string) =>
    request<AuthResponse>('/api/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) }),
  me: () => request<{ user: PublicUser }>('/api/me'),
  presets: () => request<{ presets: Preset[]; total: number }>('/api/presets'),
  /** Projects without photos (photoDataUrl is null); use getProject for the full one. */
  listProjects: () => request<{ projects: Project[] }>('/api/projects').then((r) => { projectsCache = r.projects; return r; }),
  getProject: (id: string) => request<{ project: Project }>(`/api/projects/${id}`),
  createProject: (input: ProjectInput) => request<{ project: Project }>('/api/projects', { method: 'POST', body: JSON.stringify(input) }),
  updateProject: (id: string, input: ProjectInput) => request<{ project: Project }>(`/api/projects/${id}`, { method: 'PUT', body: JSON.stringify(input) }),
  deleteProject: (id: string) => request<{ ok: true }>(`/api/projects/${id}`, { method: 'DELETE' }),
  estimate: (id: string, options?: EstimateOptions) =>
    request<{ estimate: EstimateBreakdown; preset: Preset }>(`/api/projects/${id}/estimate`, { method: 'POST', body: JSON.stringify({ options }) }),
  getSettings: () => request<{ settings: PricingSettings }>('/api/settings'),
  saveSettings: (settings: PricingSettings) => request<{ settings: PricingSettings }>('/api/settings', { method: 'PUT', body: JSON.stringify(settings) }),
  /** Signs the contract: the quote becomes a closed deal with the price and terms frozen. */
  signContract: (id: string, input: SignContractInput) =>
    request<{ project: Project }>(`/api/projects/${id}/sign`, { method: 'POST', body: JSON.stringify(input) }),
  voidContract: (id: string) => request<{ project: Project }>(`/api/projects/${id}/void`, { method: 'POST', body: '{}' }),
  getContractTerms: () => request<{ terms: string | null; defaultTerms: string }>('/api/settings/contract-terms'),
  saveContractTerms: (terms: string | null) =>
    request<{ terms: string | null; defaultTerms: string }>('/api/settings/contract-terms', { method: 'PUT', body: JSON.stringify({ terms }) }),
};
