import { Router, Request, Response } from 'express';
import { DEFAULT_CONTRACT_TERMS, MAX_CONTRACT_TERMS_LENGTH, validatePricingSettings } from '@glowlab/shared';
import { getContractTerms, getSettings, saveContractTerms, saveSettings } from '../db';

const router = Router();

router.get('/', async (req: Request, res: Response) => { res.json({ settings: await getSettings(req.currentUser.id) }); });

router.put('/', async (req: Request, res: Response) => {
  const { settings, error } = validatePricingSettings(req.body);
  if (!settings) { res.status(400).json({ error }); return; }
  await saveSettings(req.currentUser.id, settings);
  res.json({ settings });
});

/** Contract terms: the business's own, or null (= the default terms). */
router.get('/contract-terms', async (req: Request, res: Response) => {
  res.json({ terms: await getContractTerms(req.currentUser.id), defaultTerms: DEFAULT_CONTRACT_TERMS });
});
router.put('/contract-terms', async (req: Request, res: Response) => {
  const raw = req.body?.terms;
  if (raw !== null && typeof raw !== 'string') { res.status(400).json({ error: 'terms must be text or null' }); return; }
  if (typeof raw === 'string' && raw.length > MAX_CONTRACT_TERMS_LENGTH) { res.status(400).json({ error: 'The contract terms are too long' }); return; }
  const terms = typeof raw === 'string' && raw.trim() ? raw.trim() : null;
  await saveContractTerms(req.currentUser.id, terms);
  res.json({ terms, defaultTerms: DEFAULT_CONTRACT_TERMS });
});

export default router;
