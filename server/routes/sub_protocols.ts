import { Router } from 'express';
import db from '../db/database.js';

const router = Router();

// GET all sub-protocols for the user
router.get('/', (req, res) => {
  const subProtocols = db.prepare(
    'SELECT * FROM sub_protocols WHERE user_id = ? ORDER BY created_at DESC'
  ).all(req.userId);
  
  res.json(subProtocols);
});

// POST create sub-protocol
router.post('/', (req, res) => {
  const { name, content } = req.body;
  if (!name) return res.status(400).json({ message: 'Name is required' });

  const result = db.prepare(
    'INSERT INTO sub_protocols (user_id, name, content) VALUES (?, ?, ?)'
  ).run(req.userId, name, content || '');
  
  const created = db.prepare('SELECT * FROM sub_protocols WHERE id = ?').get(result.lastInsertRowid);
  res.status(201).json(created);
});

// PUT update sub-protocol
router.put('/:id', (req, res) => {
  const { name, content } = req.body;
  
  const existing = db.prepare('SELECT user_id FROM sub_protocols WHERE id = ?').get(req.params.id) as any;
  if (!existing || existing.user_id !== req.userId) return res.status(403).json({ message: 'Forbidden' });

  db.prepare(
    `UPDATE sub_protocols SET name = ?, content = ?, updated_at = datetime('now', 'localtime') WHERE id = ?`
  ).run(name, content || '', req.params.id);
  
  const updated = db.prepare('SELECT * FROM sub_protocols WHERE id = ?').get(req.params.id);
  res.json(updated);
});

// DELETE sub-protocol
router.delete('/:id', (req, res) => {
  const existing = db.prepare('SELECT user_id FROM sub_protocols WHERE id = ?').get(req.params.id) as any;
  if (!existing || existing.user_id !== req.userId) return res.status(403).json({ message: 'Forbidden' });

  // Clear references from steps before deleting to avoid foreign key constraint violations
  db.prepare('UPDATE steps SET sub_protocol_id = NULL, sub_protocol = NULL WHERE sub_protocol_id = ?').run(req.params.id);

  db.prepare('DELETE FROM sub_protocols WHERE id = ?').run(req.params.id);
  res.status(204).send();
});

export default router;
