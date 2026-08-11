import { Router, Request, Response } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { isSupabaseEnabled, getSupabase, getSupabaseAdmin } from '../db/supabase.js';
import db from '../db/database.js';

const router = Router();

// All Supabase auth routes require local authentication first
router.use(requireAuth);

router.post('/signup', async (req: Request, res: Response) => {
  try {
    if (!isSupabaseEnabled()) return res.status(503).json({ message: 'Supabase disabled' });
    const adminClient = getSupabaseAdmin();
    if (!adminClient) return res.status(503).json({ message: 'Supabase admin disabled' });

    const { email, password, username } = req.body;

    const { data, error } = await adminClient.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { username }
    });

    if (error) throw error;

    const supabaseUserId = data.user.id;

    db.prepare('UPDATE users SET supabase_user_id = ? WHERE id = ?').run(supabaseUserId, req.userId);

    res.status(201).json({ supabase_user_id: supabaseUserId, email: data.user.email });
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
});

router.post('/login', async (req: Request, res: Response) => {
  try {
    if (!isSupabaseEnabled()) return res.status(503).json({ message: 'Supabase disabled' });
    const supabase = getSupabase();
    if (!supabase) return res.status(503).json({ message: 'Supabase disabled' });

    const { email, password } = req.body;
    
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password
    });

    if (error) throw error;

    res.json({
      access_token: data.session.access_token,
      refresh_token: data.session.refresh_token,
      user: data.user,
      expires_in: data.session.expires_in
    });
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
});

router.post('/link', async (req: Request, res: Response) => {
  try {
    if (!isSupabaseEnabled()) return res.status(503).json({ message: 'Supabase disabled' });
    const supabase = getSupabase();
    if (!supabase) return res.status(503).json({ message: 'Supabase disabled' });

    const { supabase_access_token } = req.body;

    const { data, error } = await supabase.auth.getUser(supabase_access_token);
    if (error) throw error;

    const supabaseUserId = data.user.id;
    const email = data.user.email;

    db.prepare('UPDATE users SET supabase_user_id = ? WHERE id = ?').run(supabaseUserId, req.userId);

    res.json({ supabase_user_id: supabaseUserId, email });
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
});

router.post('/unlink', async (req: Request, res: Response) => {
  try {
    db.prepare('UPDATE users SET supabase_user_id = NULL WHERE id = ?').run(req.userId);
    res.json({ success: true });
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
});

router.get('/status', async (req: Request, res: Response) => {
  try {
    const enabled = isSupabaseEnabled();
    if (!enabled) {
      return res.json({ enabled: false, linked: false });
    }

    const user = db.prepare('SELECT supabase_user_id FROM users WHERE id = ?').get(req.userId) as any;
    
    if (user && user.supabase_user_id) {
      // Get the email from Supabase Admin (or you can fetch from public.profiles)
      let email = '';
      const adminClient = getSupabaseAdmin();
      if (adminClient) {
        const { data: { user: authUser } } = await adminClient.auth.admin.getUserById(user.supabase_user_id);
        if (authUser) email = authUser.email || '';
      }

      return res.json({
        enabled: true,
        linked: true,
        userId: user.supabase_user_id,
        email: email
      });
    }

    res.json({ enabled: true, linked: false });
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
});

router.post('/refresh', async (req: Request, res: Response) => {
  try {
    if (!isSupabaseEnabled()) return res.status(503).json({ message: 'Supabase disabled' });
    const supabase = getSupabase();
    if (!supabase) return res.status(503).json({ message: 'Supabase disabled' });

    const { refresh_token } = req.body;
    
    const { data, error } = await supabase.auth.refreshSession({ refresh_token });
    if (error) throw error;

    res.json({
      access_token: data.session?.access_token,
      refresh_token: data.session?.refresh_token,
      expires_in: data.session?.expires_in
    });
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
});

export default router;
