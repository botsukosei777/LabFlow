import { Request, Response, NextFunction } from 'express';
import { isSupabaseEnabled } from '../db/supabase.js';
import { createClient } from '@supabase/supabase-js';
import db from '../db/database.js';

declare global {
  namespace Express {
    interface Request {
      supabaseUserId?: string;
      supabaseToken?: string;
      userSupabase?: any; // User-scoped Supabase client
    }
  }
}

export const requireSupabase = (req: Request, res: Response, next: NextFunction) => {
  if (!isSupabaseEnabled()) {
    return res.status(503).json({ message: 'Supabase is not configured' });
  }
  
  // Get Supabase user ID from local DB
  const user = db.prepare('SELECT supabase_user_id FROM users WHERE id = ?').get(req.userId) as any;
  if (!user?.supabase_user_id) {
    return res.status(403).json({ message: 'Supabase account not linked. Please link your account in Settings.' });
  }
  
  // Get Supabase access token from header
  const supabaseToken = req.headers['x-supabase-token'] as string;
  if (!supabaseToken) {
    return res.status(401).json({ message: 'Supabase authentication required' });
  }
  
  req.supabaseUserId = user.supabase_user_id;
  req.supabaseToken = supabaseToken;
  
  // Create user-scoped Supabase client for RLS
  const url = process.env.SUPABASE_URL!;
  const key = process.env.SUPABASE_PUBLISHABLE_KEY!;
  req.userSupabase = createClient(url, key, {
    global: { headers: { Authorization: `Bearer ${supabaseToken}` } }
  });
  
  next();
};
