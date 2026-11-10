import type { DbUser } from './db';

declare global {
  namespace Express {
    interface Request {
      currentUser: DbUser;
    }
  }
}

export {};
