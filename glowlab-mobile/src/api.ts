import * as SecureStore from 'expo-secure-store';
import type { EstimateBreakdown, EstimateOptions, Preset, PricingSettings, Project, PublicUser } from '@glowlab/shared';
import { API_URL } from './config';

const TOKEN_KEY = 'glowlab.token';
let cachedToken: string | null = null;

export async function loadToken(): Promise<string | null> {
  cachedToken = await SecureStore.getItemAsync(TOKEN_KEY);
  return cachedToken;
}
export async function saveToken(token: string | null): Promise<void> {
  cachedToken = token;
  if (token) await SecureStore.setItemAsync(TOKEN_KEY, token);
  else await SecureStore.deleteItemAsync(TOKEN_KEY);
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, {
    ...options,
    headers: { 'Content-Type': 'application/json', ...(cachedToken ? { Authorization: `Bearer ${cachedToken}` } : {}), ...(options.headers ?? {}) },
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

export function projectInput(p: Project): ProjectInput {
  return {
    clientName: p.clientName, address: p.address, photoDataUrl: p.photoDataUrl,
    imageWidth: p.imageWidth, imageHeight: p.imageHeight, calibration: p.calibration,
    lines: p.lines, presetId: p.presetId, estimateOptions: p.estimateOptions,
  };
}
