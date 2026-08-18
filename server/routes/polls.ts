import { Router, Request, Response } from 'express';
import db from '../db/database.js';

const router = Router();

// GET /api/polls
router.get('/', (req: Request, res: Response) => {
  try {
    const allPolls = db.prepare(`
      SELECT DISTINCT p.* 
      FROM polls p
      LEFT JOIN poll_votes pv ON p.id = pv.poll_id
      WHERE p.user_id = ? OR pv.user_id = ?
      ORDER BY p.created_at DESC
    `).all(req.userId, req.userId) as any[];

    res.json(allPolls);
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
});

// GET /api/polls/:id
router.get('/:id', (req: Request, res: Response) => {
  try {
    const poll = db.prepare('SELECT * FROM polls WHERE id = ?').get(req.params.id) as any;
    if (!poll) return res.status(404).json({ message: 'Poll not found' });
    
    const options = db.prepare('SELECT * FROM poll_options WHERE poll_id = ? ORDER BY order_index ASC, id ASC').all(req.params.id) as any[];
    const votes = db.prepare('SELECT * FROM poll_votes WHERE poll_id = ?').all(req.params.id) as any[];
    
    res.json({
      ...poll,
      settings: JSON.parse(poll.settings || '{}'),
      options,
      votes: votes.map(v => ({ ...v, answers: JSON.parse(v.answers || '{}') }))
    });
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
});

// POST /api/polls
router.post('/', (req: Request, res: Response) => {
  const { title, description, type, deadline, settings, options } = req.body;
  try {
    const insertPoll = db.prepare(`
      INSERT INTO polls (user_id, title, description, type, deadline, settings, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, datetime('now', 'localtime'), datetime('now', 'localtime'))
    `);
    
    const info = insertPoll.run(req.userId, title, description || '', type, deadline || null, JSON.stringify(settings || {}));
    const pollId = Number(info.lastInsertRowid);
    
    if (options && Array.isArray(options)) {
      const insertOption = db.prepare(`
        INSERT INTO poll_options (poll_id, text, order_index, created_at)
        VALUES (?, ?, ?, datetime('now', 'localtime'))
      `);
      
      const insertMany = db.transaction((opts: any[]) => {
        opts.forEach((opt, idx) => {
          insertOption.run(pollId, opt.text, idx);
        });
      });
      
      insertMany(options);
    }
    
    res.status(201).json({ id: pollId });
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
});

// POST /api/polls/:id/options
router.post('/:id/options', (req: Request, res: Response) => {
  const { options } = req.body;
  const pollId = req.params.id;
  try {
    const poll = db.prepare('SELECT id FROM polls WHERE id = ? AND user_id = ?').get(pollId, req.userId);
    if (!poll) return res.status(403).json({ message: 'Unauthorized' });
    
    if (options && Array.isArray(options)) {
      const existingOptions = db.prepare('SELECT max(order_index) as maxIdx FROM poll_options WHERE poll_id = ?').get(pollId) as any;
      let startIdx = (existingOptions?.maxIdx ?? -1) + 1;
      
      const insertOption = db.prepare(`
        INSERT INTO poll_options (poll_id, text, order_index, created_at)
        VALUES (?, ?, ?, datetime('now', 'localtime'))
      `);
      
      const insertMany = db.transaction((opts: any[]) => {
        opts.forEach((opt) => {
          insertOption.run(pollId, opt.text, startIdx++);
        });
      });
      insertMany(options);
    }
    res.json({ message: 'Options added' });
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
});

// POST /api/polls/:id/vote
router.post('/:id/vote', (req: Request, res: Response) => {
  const { voter_name, answers } = req.body;
  const pollId = req.params.id;
  
  try {
    const existing = db.prepare('SELECT id FROM poll_votes WHERE poll_id = ? AND user_id = ?').get(pollId, req.userId) as any;
    
    if (existing) {
      db.prepare(`
        UPDATE poll_votes 
        SET voter_name = ?, answers = ?, updated_at = datetime('now', 'localtime') 
        WHERE id = ?
      `).run(voter_name, JSON.stringify(answers || {}), existing.id);
    } else {
      db.prepare(`
        INSERT INTO poll_votes (poll_id, user_id, voter_name, answers, created_at, updated_at)
        VALUES (?, ?, ?, ?, datetime('now', 'localtime'), datetime('now', 'localtime'))
      `).run(pollId, req.userId, voter_name, JSON.stringify(answers || {}));
    }
    
    res.json({ message: 'Vote recorded' });
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
});

// PUT /api/polls/:id/settings
router.put('/:id/settings', (req: Request, res: Response) => {
  const { settings } = req.body;
  const pollId = req.params.id;
  try {
    const poll = db.prepare('SELECT id FROM polls WHERE id = ? AND user_id = ?').get(pollId, req.userId);
    if (!poll) return res.status(403).json({ message: 'Unauthorized' });
    
    db.prepare(`UPDATE polls SET settings = ?, updated_at = datetime('now', 'localtime') WHERE id = ?`).run(JSON.stringify(settings || {}), pollId);
    res.json({ message: 'Settings updated' });
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
});

// DELETE /api/polls/:id/options/:optionId
router.delete('/:id/options/:optionId', (req: Request, res: Response) => {
  const pollId = req.params.id;
  const optionId = req.params.optionId;
  try {
    const poll = db.prepare('SELECT id FROM polls WHERE id = ? AND user_id = ?').get(pollId, req.userId);
    if (!poll) return res.status(403).json({ message: 'Unauthorized' });
    
    db.prepare('DELETE FROM poll_options WHERE id = ? AND poll_id = ?').run(optionId, pollId);
    res.status(204).send();
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
});

// DELETE /api/polls/:id
router.delete('/:id', (req: Request, res: Response) => {
  try {
    db.prepare('DELETE FROM polls WHERE id = ?').run(req.params.id);
    res.status(204).send();
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
});

export default router;
