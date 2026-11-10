import { Router, Request, Response } from 'express';
import type { PricingSettings } from '@glowlab/shared';
import { getSettings, saveSettings } from '../db';

const router = Router();
const FIELDS: (keyof PricingSettings)[] = ['baseRatePerFoot', 'purchaseMultiplier', 'secondStoryMultiplier', 'steepRoofFee', 'wreathPrice', 'pathwayStakePrice', 'treeWrapPrice', 'timerPrice'];

router.get('/', (req: Request, res: Response) => { res.json({ settings: getSettings(req.currentUser.id) }); });

router.put('/', (req: Request, res: Response) => {
  const body = (req.body ?? {}) as Record<string, unknown>;
  const settings = {} as PricingSettings;
  for (const f of FIELDS) {
    const v = Number(body[f]);
    if (!Number.isFinite(v) || v < 0) { res.status(400).json({ error: `${f} must be a non-negative number` }); return; }
    settings[f] = v;
  }
  saveSettings(req.currentUser.id, settings);
  res.json({ settings });
});

export default router;
