import { NextFunction, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { getUserById, type DbUser } from './db';

export function getJwtSecret(): string {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    if (process.env.NODE_ENV === 'production') {
      throw new Error('JWT_SECRET must be set in production');
    }
    console.warn('[warn] JWT_SECRET not set; using an insecure default secret. Set JWT_SECRET in production.');
    return 'dev-secret-change-me';
  }
  return secret;
}

export function signToken(userId: string): string {
  return jwt.sign({ sub: userId }, getJwtSecret(), { algorithm: 'HS256', expiresIn: '30d' });
}

export async function authMiddleware(req: Request, res: Response, next: NextFunction): Promise<void> {
  const header = req.headers.authorization || '';
  const match = /^Bearer\s+(.+)$/i.exec(header);
  if (!match) {
    res.status(401).json({ error: 'Missing or invalid Authorization header' });
    return;
  }
  let payload: { sub: string };
  try {
    payload = jwt.verify(match[1], getJwtSecret(), { algorithms: ['HS256'] }) as { sub: string };
  } catch {
    res.status(401).json({ error: 'Invalid or expired token' });
    return;
  }
  const user: DbUser | undefined = await getUserById(payload.sub);
  if (!user) {
    res.status(401).json({ error: 'Invalid token' });
    return;
  }
  req.currentUser = user;
  next();
}
