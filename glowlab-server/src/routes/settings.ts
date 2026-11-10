import { Router, Request, Response } from 'express';
import { validatePricingSettings } from '@glowlab/shared';
import { getSettings, saveSettings } from '../db';

const router = Router();

router.get('/', async (req: Request, res: Response) => { res.json({ settings: await getSettings(req.currentUser.id) }); });

router.put('/', async (req: Request, res: Response) => {
  const { settings, error } = validatePricingSettings(req.body);
  if (!settings) { res.status(400).json({ error }); return; }
  await saveSettings(req.currentUser.id, settings);
  res.json({ settings });
});

export default router;
