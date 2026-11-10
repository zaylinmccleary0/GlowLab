import express, { Request, Response, NextFunction } from 'express';
import fs from 'fs';
import path from 'path';
import { PRESETS } from '@glowlab/shared';
import { openDatabase, toPublicUser } from './db';
import { authMiddleware, getJwtSecret } from './auth';
import authRoutes from './routes/auth';
import projectsRoutes from './routes/projects';
import settingsRoutes from './routes/settings';

export function buildApp(): express.Express {
  const app = express();
  app.use(express.json({ limit: '20mb' })); // photos are stored as data URLs

  app.get('/api/health', (_req: Request, res: Response) => { res.json({ ok: true }); });
  app.use('/api/auth', authRoutes);
  app.use('/api', authMiddleware);

  app.get('/api/me', (req: Request, res: Response) => { res.json({ user: toPublicUser(req.currentUser) }); });
  app.get('/api/presets', (_req: Request, res: Response) => { res.json({ presets: PRESETS, total: PRESETS.length }); });
  app.use('/api/projects', projectsRoutes);
  app.use('/api/settings', settingsRoutes);

  app.use('/api', (_req: Request, res: Response) => { res.status(404).json({ error: 'Not found' }); });

  const webDir = [
    path.resolve(__dirname, '../../glowlab-web/dist'),
    path.resolve(process.cwd(), '../glowlab-web/dist'),
  ].find((dir) => fs.existsSync(path.join(dir, 'index.html')));
  if (webDir) {
    app.use(express.static(webDir));
    app.get('*', (_req: Request, res: Response) => { res.sendFile(path.join(webDir, 'index.html')); });
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    console.error('Unhandled error:', err);
    if (!res.headersSent) res.status(500).json({ error: 'Internal server error' });
  });
  return app;
}

export function start(): void {
  openDatabase();
  getJwtSecret();
  const port = Number(process.env.PORT) || 4200;
  const app = buildApp();
  app.listen(port, () => { console.log(`GlowLab API listening on port ${port}`); });
}

if (require.main === module) start();
