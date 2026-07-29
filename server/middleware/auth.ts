import { Request, Response, NextFunction } from 'express';
import db from '../db/database.js';

declare global {
  namespace Express {
    interface Request {
      userId?: number;
    }
  }
}

export const requireAuth = (req: Request, res: Response, next: NextFunction) => {
  let token: string;
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    token = authHeader.split(' ')[1];
  } else if (req.query.token) {
    token = req.query.token as string;
  } else {
    return res.status(401).json({ message: 'Unauthorized' });
  }
  
  const session = db.prepare('SELECT user_id, expires_at FROM sessions WHERE token = ?').get(token) as { user_id: number, expires_at: string } | undefined;
  
  if (!session) {
    return res.status(401).json({ message: 'Invalid session' });
  }
  
  if (new Date(session.expires_at) < new Date()) {
    db.prepare('DELETE FROM sessions WHERE token = ?').run(token);
    return res.status(401).json({ message: 'Session expired' });
  }

  req.userId = session.user_id;
  next();
};
