import type { EstimateBreakdown, EstimateOptions, Preset, PricingSettings, Project, PublicUser } from '@glowlab/shared';

const TOKEN_KEY = 'glowlab.token';
export function getToken(): string | null { return localStorage.getItem(TOKEN_KEY); }
export function setToken(token: string | null): void {
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
export type ProjectInput = Omit<Project, 'id' | 'createdAt' | 'updatedAt'>;

export const api = {
  register: (name: string, email: string, password: string) =>
    request<AuthResponse>('/api/auth/register', { method: 'POST', body: JSON.stringify({ name, email, password }) }),
  login: (email: string, password: string) =>
    request<AuthResponse>('/api/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) }),
  me: () => request<{ user: PublicUser }>('/api/me'),
  presets: () => request<{ presets: Preset[]; total: number }>('/api/presets'),
  /** Projects without photos (photoDataUrl is null); use getProject for the full one. */
  listProjects: () => request<{ projects: Project[] }>('/api/projects'),
  getProject: (id: string) => request<{ project: Project }>(`/api/projects/${id}`),
  createProject: (input: ProjectInput) => request<{ project: Project }>('/api/projects', { method: 'POST', body: JSON.stringify(input) }),
  updateProject: (id: string, input: ProjectInput) => request<{ project: Project }>(`/api/projects/${id}`, { method: 'PUT', body: JSON.stringify(input) }),
  deleteProject: (id: string) => request<{ ok: true }>(`/api/projects/${id}`, { method: 'DELETE' }),
  estimate: (id: string, options?: EstimateOptions) =>
    request<{ estimate: EstimateBreakdown; preset: Preset }>(`/api/projects/${id}/estimate`, { method: 'POST', body: JSON.stringify({ options }) }),
  getSettings: () => request<{ settings: PricingSettings }>('/api/settings'),
  saveSettings: (settings: PricingSettings) => request<{ settings: PricingSettings }>('/api/settings', { method: 'PUT', body: JSON.stringify(settings) }),
};
