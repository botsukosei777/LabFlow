import { Router } from 'express';
import db from '../db/database.js';

const router = Router();

// Get all quick links
router.get('/', (req, res) => {
  const userId = req.userId;
  try {
    const links = db.prepare(`
      SELECT * FROM quick_links 
      WHERE user_id = ? 
      ORDER BY order_index ASC, id ASC
    `).all(userId);
    res.json(links);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch quick links' });
  }
});

// Create a new quick link
router.post('/', (req, res) => {
  const userId = req.userId;
  const { title, url, open_in_app } = req.body;
  
  if (!title || !url) return res.status(400).json({ error: 'Title and URL are required' });

  try {
    const maxOrderInfo = db.prepare('SELECT MAX(order_index) as max_order FROM quick_links WHERE user_id = ?').get(userId) as any;
    const nextOrder = (maxOrderInfo?.max_order ?? -1) + 1;

    const result = db.prepare(`
      INSERT INTO quick_links (user_id, title, url, open_in_app, order_index)
      VALUES (?, ?, ?, ?, ?)
    `).run(userId, title, url, open_in_app ? 1 : 0, nextOrder);
    
    const newLink = db.prepare('SELECT * FROM quick_links WHERE id = ?').get(result.lastInsertRowid);
    res.status(201).json(newLink);
  } catch (error) {
    res.status(500).json({ error: 'Failed to create quick link' });
  }
});

// Update a quick link
router.put('/:id', (req, res) => {
  const userId = req.userId;
  const { id } = req.params;
  const { title, url, open_in_app, order_index } = req.body;

  try {
    const existing = db.prepare('SELECT order_index FROM quick_links WHERE id = ?').get(id) as any;
    const finalOrder = order_index !== undefined ? order_index : (existing?.order_index ?? 0);

    db.prepare(`
      UPDATE quick_links 
      SET title = ?, url = ?, open_in_app = ?, order_index = ?
      WHERE id = ? AND user_id = ?
    `).run(title, url, open_in_app ? 1 : 0, finalOrder, id, userId);
    
    const updatedLink = db.prepare('SELECT * FROM quick_links WHERE id = ?').get(id);
    res.json(updatedLink);
  } catch (error) {
    res.status(500).json({ error: 'Failed to update quick link' });
  }
});

// Delete a quick link
router.delete('/:id', (req, res) => {
  const userId = req.userId;
  const { id } = req.params;

  try {
    db.prepare(`
      DELETE FROM quick_links 
      WHERE id = ? AND user_id = ?
    `).run(id, userId);
    res.json({ message: 'Deleted' });
  } catch (error) {
    res.status(500).json({ error: 'Failed to delete quick link' });
  }
});

export default router;
