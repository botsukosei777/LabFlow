import { Router } from 'express';
import crypto from 'crypto';
import db from '../db/database.js';
import { requireAuth } from '../middleware/auth.js';
import { getSupabaseAdmin } from '../db/supabase.js';

const router = Router();

function generateToken() {
  return crypto.randomBytes(32).toString('hex');
}

function hashPassword(password: string, salt: string = crypto.randomBytes(16).toString('hex')) {
  const hash = crypto.scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${hash}`;
}

function verifyPassword(password: string, storedHash: string) {
  const [salt, key] = storedHash.split(':');
  const hashedBuffer = crypto.scryptSync(password, salt!, 64);
  const keyBuffer = Buffer.from(key!, 'hex');
  return crypto.timingSafeEqual(hashedBuffer, keyBuffer);
}

router.post('/register', (req, res) => {
  const { username, password } = req.body;
  
  if (!username || !password || username.length < 3 || password.length < 6) {
    return res.status(400).json({ message: 'Invalid username or password (min 3 chars username, min 6 chars password)' });
  }

  try {
    const password_hash = hashPassword(password);
    const result = db.prepare('INSERT INTO users (username, password_hash) VALUES (?, ?)').run(username, password_hash);
    
    const token = generateToken();
    const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
    
    db.prepare('INSERT INTO sessions (token, user_id, expires_at) VALUES (?, ?, ?)').run(token, Number(result.lastInsertRowid), expiresAt);
    
    res.status(201).json({ token, user: { id: Number(result.lastInsertRowid), username } });
  } catch (e: any) {
    if (e.code === 'SQLITE_CONSTRAINT_UNIQUE' || e.message.includes('UNIQUE')) {
      return res.status(409).json({ message: 'Username already exists' });
    }
    res.status(500).json({ message: 'Server error' });
  }
});

router.post('/login', (req, res) => {
  const { username, password } = req.body;
  
  const user = db.prepare('SELECT id, username, password_hash FROM users WHERE username = ?').get(username) as any;
  if (!user || !verifyPassword(password, user.password_hash)) {
    return res.status(401).json({ message: 'Invalid username or password' });
  }

  const token = generateToken();
  const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
  
  db.prepare('INSERT INTO sessions (token, user_id, expires_at) VALUES (?, ?, ?)').run(token, user.id, expiresAt);
  
  res.json({ token, user: { id: user.id, username: user.username } });
});

router.post('/logout', requireAuth, (req, res) => {
  const token = req.headers.authorization?.split(' ')[1];
  if (token) {
    db.prepare('DELETE FROM sessions WHERE token = ?').run(token);
  }
  res.status(204).send();
});

router.get('/me', requireAuth, async (req, res) => {
  const user = db.prepare('SELECT id, username, created_at, supabase_user_id FROM users WHERE id = ?').get(req.userId) as any;
  if (!user) {
    return res.status(404).json({ message: 'User not found' });
  }

  // Fetch Supabase username if linked
  if (user.supabase_user_id) {
    try {
      const adminClient = getSupabaseAdmin();
      if (adminClient) {
        const { data } = await adminClient.auth.admin.getUserById(user.supabase_user_id);
        if (data?.user) {
          user.supabase_username = data.user.user_metadata?.username || 
                                   data.user.user_metadata?.full_name || 
                                   data.user.user_metadata?.name || 
                                   data.user.email?.split('@')[0];
        }
      }
    } catch (e) {
      console.error('Failed to fetch supabase username in /me', e);
    }
  }

  res.json(user);
});

router.put('/profile', requireAuth, (req, res) => {
  const { currentPassword, newUsername, newPassword } = req.body;
  
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.userId) as any;
  if (!user || !verifyPassword(currentPassword, user.password_hash)) {
    return res.status(401).json({ message: '現在のパスワードが間違っています' });
  }

  try {
    if (newUsername && newUsername !== user.username) {
      const existing = db.prepare('SELECT id FROM users WHERE username = ?').get(newUsername);
      if (existing) {
        return res.status(409).json({ message: 'このユーザー名は既に使用されています' });
      }
      db.prepare('UPDATE users SET username = ? WHERE id = ?').run(newUsername, req.userId);
    }

    if (newPassword) {
      const hash = hashPassword(newPassword);
      db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(hash, req.userId);
    }
    
    res.json({ message: 'Profile updated successfully' });
  } catch (e) {
    res.status(500).json({ message: 'Server error' });
  }
});

export default router;
