import { Router, Request, Response } from 'express';
import type { EstimateOptions, Project } from '@glowlab/shared';
import { DEFAULT_ESTIMATE_OPTIONS, computeEstimate, getPreset } from '@glowlab/shared';
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
  }
  const calibration = (body.calibration as Project['calibration']) ?? existing?.calibration ?? null;
  if (calibration !== null) {
    if (!calibration.a || !calibration.b || !(Number(calibration.realFeet) > 0)) return { error: 'calibration needs a, b and realFeet > 0' };
  }
  const opts = ((body.estimateOptions as EstimateOptions) ?? existing?.estimateOptions ?? DEFAULT_ESTIMATE_OPTIONS);
  const estimateOptions: EstimateOptions = {
    stories: opts.stories === 2 ? 2 : 1,
    steepRoof: Boolean(opts.steepRoof),
    model: opts.model === 'purchase' ? 'purchase' : 'rental',
    addOns: {
      wreaths: Math.max(0, Math.floor(Number(opts.addOns?.wreaths) || 0)),
      pathwayStakes: Math.max(0, Math.floor(Number(opts.addOns?.pathwayStakes) || 0)),
      treeWraps: Math.max(0, Math.floor(Number(opts.addOns?.treeWraps) || 0)),
      timers: Math.max(0, Math.floor(Number(opts.addOns?.timers) || 0)),
    },
  };
  return {
    input: {
      clientName: clientName.trim(),
      address: typeof body.address === 'string' ? body.address : (existing?.address ?? ''),
      photoDataUrl: (body.photoDataUrl as string | null) ?? existing?.photoDataUrl ?? null,
      imageWidth: Number(body.imageWidth) || existing?.imageWidth || 1000,
      imageHeight: Number(body.imageHeight) || existing?.imageHeight || 1000,
      calibration, lines, presetId, estimateOptions,
    },
  };
}

router.get('/', (req: Request, res: Response) => { res.json({ projects: listProjects(req.currentUser.id) }); });

router.post('/', (req: Request, res: Response) => {
  const { input, error } = parseInput(req.body ?? {});
  if (!input) { res.status(400).json({ error }); return; }
  res.status(201).json({ project: insertProject(req.currentUser.id, input) });
});

router.get('/:id', (req: Request, res: Response) => {
  const project = getProject(req.currentUser.id, req.params.id);
  if (!project) { res.status(404).json({ error: 'Project not found' }); return; }
  res.json({ project });
});

router.put('/:id', (req: Request, res: Response) => {
  const existing = getProject(req.currentUser.id, req.params.id);
  if (!existing) { res.status(404).json({ error: 'Project not found' }); return; }
  const { input, error } = parseInput(req.body ?? {}, existing);
  if (!input) { res.status(400).json({ error }); return; }
  res.json({ project: updateProject(req.currentUser.id, req.params.id, input) });
});

router.delete('/:id', (req: Request, res: Response) => {
  if (!deleteProject(req.currentUser.id, req.params.id)) { res.status(404).json({ error: 'Project not found' }); return; }
  res.json({ ok: true });
});

router.post('/:id/estimate', (req: Request, res: Response) => {
  const project = getProject(req.currentUser.id, req.params.id);
  if (!project) { res.status(404).json({ error: 'Project not found' }); return; }
  const preset = getPreset(project.presetId);
  if (!preset) { res.status(400).json({ error: 'Project has an unknown preset' }); return; }
  const options = (req.body?.options as EstimateOptions) ?? project.estimateOptions;
  const estimate = computeEstimate(project, preset, getSettings(req.currentUser.id), options);
  res.json({ estimate, preset });
});

export default router;
