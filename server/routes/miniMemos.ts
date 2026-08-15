import { Router } from 'express';
import db from '../db/database.js';

const router = Router();

// Get active mini memos
router.get('/', (req, res) => {
  const userId = req.userId;
  try {
    const memos = db.prepare(`
      SELECT * FROM mini_memos 
      WHERE user_id = ? AND is_completed = 0
      ORDER BY created_at DESC
    `).all(userId);
    res.json(memos);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch mini memos' });
  }
});

// Create a new mini memo
router.post('/', (req, res) => {
  const userId = req.userId;
  const { message } = req.body;
  if (!message) return res.status(400).json({ error: 'Message is required' });

  try {
    const result = db.prepare(`
      INSERT INTO mini_memos (user_id, message)
      VALUES (?, ?)
    `).run(userId, message);
    
    const newMemo = db.prepare('SELECT * FROM mini_memos WHERE id = ?').get(result.lastInsertRowid);
    res.status(201).json(newMemo);
  } catch (error) {
    res.status(500).json({ error: 'Failed to create mini memo' });
  }
});

// Complete a mini memo
router.put('/:id/complete', (req, res) => {
  const userId = req.userId;
  const { id } = req.params;

  try {
    db.prepare(`
      UPDATE mini_memos 
      SET is_completed = 1, updated_at = datetime('now', 'localtime')
      WHERE id = ? AND user_id = ?
    `).run(id, userId);
    res.json({ message: 'Marked as completed' });
  } catch (error) {
    res.status(500).json({ error: 'Failed to complete mini memo' });
  }
});

// Delete a mini memo
router.delete('/:id', (req, res) => {
  const userId = req.userId;
  const { id } = req.params;

  try {
    db.prepare(`
      DELETE FROM mini_memos 
      WHERE id = ? AND user_id = ?
    `).run(id, userId);
    res.json({ message: 'Deleted' });
  } catch (error) {
    res.status(500).json({ error: 'Failed to delete mini memo' });
  }
});

export default router;
