import { Router, Request, Response } from 'express';
import type { EstimateOptions, Project } from '@glowlab/shared';
import { DEFAULT_ESTIMATE_OPTIONS, computeEstimate, getPreset, normalizeEstimateOptions } from '@glowlab/shared';
import { deleteProject, getProject, getSettings, insertProject, listProjects, updateProject, type ProjectInput } from '../db';

const router = Router();
const LINE_KINDS = ['roofline', 'ridge', 'gutter', 'window', 'door', 'pathway', 'tree', 'outline'];

function parseInput(body: Record<string, unknown>, existing?: Project): { input?: ProjectInput; error?: string } {
  const clientName = (body.clientName as string) ?? existing?.clientName;
  if (typeof clientName !== 'string' || clientName.trim().length === 0) return { error: 'clientName is required' };
  const presetId = (body.presetId as string) ?? existing?.presetId ?? 'classic-warm-white';
  if (!getPreset(presetId)) return { error: `Unknown presetId: ${presetId}` };
  const lines = (body.lines as Project['lines']) ?? existing?.lines ?? [];
  if (!Array.isArray(lines)) return { error: 'lines must be an array' };
  for (const l of lines) {
    if (!l || typeof l.id !== 'string' || !LINE_KINDS.includes(l.kind) || !Array.isArray(l.points)) return { error: 'Each line needs id, a valid kind, and points[]' };
    for (const p of l.points) if (typeof p?.x !== 'number' || typeof p?.y !== 'number') return { error: 'Line points need numeric x/y' };
    if (l.bulbColors !== undefined) {
      if (!l.bulbColors || typeof l.bulbColors !== 'object' || Array.isArray(l.bulbColors)) return { error: 'bulbColors must be an object' };
      const entries = Object.entries(l.bulbColors);
      if (entries.length > 5000) return { error: 'Too many painted bulbs on one line' };
      for (const [k, v] of entries) {
        if (!/^\d{1,5}$/.test(k) || typeof v !== 'string' || !/^#[0-9a-fA-F]{6}$/.test(v)) return { error: 'bulbColors needs bulb numbers mapped to colors like #FF2D2D' };
      }
    }
  }
  const calibration = (body.calibration as Project['calibration']) ?? existing?.calibration ?? null;
  if (calibration !== null) {
    if (!calibration.a || !calibration.b || !(Number(calibration.realFeet) > 0)) return { error: 'calibration needs a, b and realFeet > 0' };
  }
  // Photo fields: a key that's present (even null, to remove the photo) replaces the saved value;
  // a missing key keeps it. A new photo without a new preview clears the stale preview.
  const photoDataUrl = 'photoDataUrl' in body ? body.photoDataUrl : (existing?.photoDataUrl ?? null);
  if (photoDataUrl !== null && (typeof photoDataUrl !== 'string' || !photoDataUrl.startsWith('data:image/'))) return { error: 'photoDataUrl must be an image data URL or null' };
  const photoChanged = photoDataUrl !== (existing?.photoDataUrl ?? null);
  const thumbDataUrl = 'thumbDataUrl' in body ? body.thumbDataUrl : (photoChanged ? null : (existing?.thumbDataUrl ?? null));
  if (thumbDataUrl !== null && (typeof thumbDataUrl !== 'string' || !thumbDataUrl.startsWith('data:image/'))) return { error: 'thumbDataUrl must be an image data URL or null' };
  if (typeof thumbDataUrl === 'string' && thumbDataUrl.length > 300_000) return { error: 'thumbDataUrl is too large (keep previews under ~200 KB)' };
  if (photoDataUrl === null && thumbDataUrl !== null) return { error: 'A preview needs a photo' };
  const estimateOptions = normalizeEstimateOptions((body.estimateOptions as EstimateOptions) ?? existing?.estimateOptions ?? DEFAULT_ESTIMATE_OPTIONS);
  return {
    input: {
      clientName: clientName.trim(),
      address: typeof body.address === 'string' ? body.address : (existing?.address ?? ''),
      photoDataUrl, thumbDataUrl,
      imageWidth: Number(body.imageWidth) || existing?.imageWidth || 1000,
      imageHeight: Number(body.imageHeight) || existing?.imageHeight || 1000,
      calibration, lines, presetId, estimateOptions,
    },
  };
}

router.get('/', async (req: Request, res: Response) => { res.json({ projects: await listProjects(req.currentUser.id) }); });

router.post('/', async (req: Request, res: Response) => {
  const { input, error } = parseInput(req.body ?? {});
  if (!input) { res.status(400).json({ error }); return; }
  res.status(201).json({ project: await insertProject(req.currentUser.id, input) });
});

router.get('/:id', async (req: Request, res: Response) => {
  const project = await getProject(req.currentUser.id, String(req.params.id));
  if (!project) { res.status(404).json({ error: 'Project not found' }); return; }
  res.json({ project });
});

router.put('/:id', async (req: Request, res: Response) => {
  const existing = await getProject(req.currentUser.id, String(req.params.id));
  if (!existing) { res.status(404).json({ error: 'Project not found' }); return; }
  const { input, error } = parseInput(req.body ?? {}, existing);
  if (!input) { res.status(400).json({ error }); return; }
  res.json({ project: await updateProject(req.currentUser.id, String(req.params.id), input) });
});

router.delete('/:id', async (req: Request, res: Response) => {
  if (!(await deleteProject(req.currentUser.id, String(req.params.id)))) { res.status(404).json({ error: 'Project not found' }); return; }
  res.json({ ok: true });
});

router.post('/:id/estimate', async (req: Request, res: Response) => {
  const project = await getProject(req.currentUser.id, String(req.params.id));
  if (!project) { res.status(404).json({ error: 'Project not found' }); return; }
  const preset = getPreset(project.presetId);
  if (!preset) { res.status(400).json({ error: 'Project has an unknown preset' }); return; }
  const options = (req.body?.options as EstimateOptions) ?? project.estimateOptions;
  const estimate = computeEstimate(project, preset, await getSettings(req.currentUser.id), options);
  res.json({ estimate, preset });
});

export default router;
