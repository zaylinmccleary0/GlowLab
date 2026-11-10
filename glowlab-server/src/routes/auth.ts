import { Router, Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import { createUser, getUserByEmail, toPublicUser } from '../db';
import { signToken } from '../auth';

const router = Router();

function isValidEmail(email: unknown): email is string {
  return typeof email === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

router.post('/register', async (req: Request, res: Response) => {
  const { name, email, password } = req.body ?? {};
  if (typeof name !== 'string' || name.trim().length === 0) {
    res.status(400).json({ error: 'Name is required' });
    return;
  }
  if (!isValidEmail(email)) {
    res.status(400).json({ error: 'A valid email is required' });
    return;
  }
  if (typeof password !== 'string' || password.length < 6) {
    res.status(400).json({ error: 'Password must be at least 6 characters' });
    return;
  }
  const normalized = email.toLowerCase();
  if (getUserByEmail(normalized)) {
    res.status(409).json({ error: 'An account with that email already exists' });
    return;
  }
  const hash = await bcrypt.hash(password, 10);
  const user = createUser(name.trim(), normalized, hash);
  res.status(201).json({ token: signToken(user.id), user: toPublicUser(user) });
});

router.post('/login', async (req: Request, res: Response) => {
  const { email, password } = req.body ?? {};
  if (!isValidEmail(email) || typeof password !== 'string') {
    res.status(400).json({ error: 'Email and password are required' });
    return;
  }
  const user = getUserByEmail(email.toLowerCase());
  if (!user || !(await bcrypt.compare(password, user.password_hash))) {
    res.status(401).json({ error: 'Wrong email or password' });
    return;
  }
  res.json({ token: signToken(user.id), user: toPublicUser(user) });
});

export default router;
