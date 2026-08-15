import { Request, Response, NextFunction } from 'express';
import crypto from 'crypto';
import db from '../db/database.js';

declare global {
  namespace Express {
    interface Request {
      userId?: number;
    }
  }
}

function getOrCreateDefaultUser(): number {
  const user = db.prepare('SELECT id FROM users LIMIT 1').get() as { id: number } | undefined;
  if (user) return user.id;

  // Auto-create a default user
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync('labflow', salt, 64).toString('hex');
  const result = db.prepare('INSERT INTO users (username, password_hash) VALUES (?, ?)').run('user', `${salt}:${hash}`);
  return Number(result.lastInsertRowid);
}

export const requireAuth = (req: Request, res: Response, next: NextFunction) => {
  // If a Bearer token is provided, try to use it (keeps existing sessions working)
  const authHeader = req.headers.authorization;
  const tokenFromQuery = req.query.token as string | undefined;
  const token = authHeader?.startsWith('Bearer ') ? authHeader.split(' ')[1] : tokenFromQuery;

  if (token) {
    const session = db.prepare('SELECT user_id, expires_at FROM sessions WHERE token = ?').get(token) as { user_id: number, expires_at: string } | undefined;
    if (session && new Date(session.expires_at) >= new Date()) {
      req.userId = session.user_id;
      return next();
    }
  }

  // No valid token — fall back to default user (single-user mode)
  req.userId = getOrCreateDefaultUser();
  next();
};

