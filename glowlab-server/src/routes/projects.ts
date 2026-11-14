import { Router, Request, Response } from 'express';
import type { EstimateOptions, Project, SignedContract } from '@glowlab/shared';
import {
  DEFAULT_ESTIMATE_OPTIONS, computeEstimate, contractTermsFor, defaultDeposit, getPreset, normalizeEstimateOptions, profileFor, round2, validateSignInput,
} from '@glowlab/shared';
import {
  deleteProject, getContractTerms, getProject, getSettings, insertProject, listProjects, signProject, updateProject, voidContract, type ProjectInput,
} from '../db';

const SIGNED_LOCKED = "This project has a signed contract, so it can't be changed. Void the contract first to edit it.";

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
  if (existing.status === 'won') { res.status(409).json({ error: SIGNED_LOCKED }); return; }
  const { input, error } = parseInput(req.body ?? {}, existing);
  if (!input) { res.status(400).json({ error }); return; }
  res.json({ project: await updateProject(req.currentUser.id, String(req.params.id), input) });
});

router.delete('/:id', async (req: Request, res: Response) => {
  const existing = await getProject(req.currentUser.id, String(req.params.id));
  if (existing?.status === 'won') { res.status(409).json({ error: 'This project has a signed contract. Void the contract before deleting it.' }); return; }
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

/**
 * Signs the contract for a quote. The price is worked out here on the server from the saved
 * design and the business's current price list and terms, then frozen into the contract.
 */
router.post('/:id/sign', async (req: Request, res: Response) => {
  const id = String(req.params.id);
  const project = await getProject(req.currentUser.id, id);
  if (!project) { res.status(404).json({ error: 'Project not found' }); return; }
  if (project.status === 'won') { res.status(409).json({ error: 'This contract is already signed.' }); return; }
  const { input, error } = validateSignInput(req.body);
  if (!input) { res.status(400).json({ error }); return; }
  const preset = getPreset(project.presetId);
  if (!preset) { res.status(400).json({ error: 'Project has an unknown preset' }); return; }
  const settings = await getSettings(req.currentUser.id);
  const options = normalizeEstimateOptions(project.estimateOptions);
  const estimate = computeEstimate(project, preset, settings, options);
  // The contract price is what you agreed with the customer; without one, it's the estimate.
  const contractTotal = input.contractTotal ?? estimate.total;
  if (!(contractTotal > 0)) {
    res.status(400).json({ error: 'Set a contract price first (this design has no estimate yet).' }); return;
  }
  const depositDue = input.depositDue ?? defaultDeposit(contractTotal);
  if (depositDue > contractTotal) { res.status(400).json({ error: "The deposit can't be more than the contract price" }); return; }
  const forwarded = String(req.headers['x-forwarded-for'] ?? '').split(',')[0].trim();
  const businessName = req.currentUser.name;
  const contract: SignedContract = {
    signedAt: new Date().toISOString(),
    customerName: input.customerName, customerPhone: input.customerPhone, customerEmail: input.customerEmail,
    businessName, clientName: project.clientName, address: project.address,
    presetName: preset.name, installType: options.installType, bulbSpacingInches: profileFor(settings, options).bulbSpacingInches,
    estimate, contractTotal, depositDue, balanceDue: round2(contractTotal - depositDue),
    terms: contractTermsFor(await getContractTerms(req.currentUser.id), businessName),
    signerIp: forwarded || req.socket.remoteAddress || '',
    signerUserAgent: String(req.headers['user-agent'] ?? '').slice(0, 300),
  };
  if (!(await signProject(req.currentUser.id, id, contract, input.signatureDataUrl))) {
    res.status(409).json({ error: 'This contract is already signed.' }); return;
  }
  res.json({ project: await getProject(req.currentUser.id, id) });
});

/** Voids a signed contract and turns the project back into an editable quote. */
router.post('/:id/void', async (req: Request, res: Response) => {
  const id = String(req.params.id);
  if (!(await voidContract(req.currentUser.id, id))) { res.status(404).json({ error: 'No signed contract to void' }); return; }
  res.json({ project: await getProject(req.currentUser.id, id) });
});

export default router;
