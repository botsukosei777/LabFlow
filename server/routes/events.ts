import { Router } from 'express';
import db from '../db/database.js';
import { recalculateBlockSchedule } from '../services/scheduleHelper.js';

const router = Router();

// GET all events for a user
router.get('/', (req, res) => {
  const events = db.prepare(`
    SELECT * FROM events
    WHERE user_id = ?
    ORDER BY date, start_time
  `).all(req.userId);
  res.json(events);
});

// POST create an event
router.post('/', (req, res) => {
  const { title, description, date, start_time, end_time, color } = req.body;
  if (!title || !date) {
    return res.status(400).json({ message: 'Title and date are required' });
  }

  const result = db.prepare(`
    INSERT INTO events (user_id, title, description, date, start_time, end_time, color)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(req.userId, title, description || '', date, start_time || null, end_time || null, color || '#3B82F6');

  const created = db.prepare('SELECT * FROM events WHERE id = ?').get(result.lastInsertRowid);
  
  // Recalculate schedules for that date
  const blocks = db.prepare(`
    SELECT sb.id FROM scheduled_blocks sb
    JOIN scheduled_experiments se ON sb.scheduled_experiment_id = se.id
    WHERE se.user_id = ? AND sb.scheduled_date = ?
  `).all(req.userId, date) as any[];

  const warnings: string[] = [];
  for (const b of blocks) {
    recalculateBlockSchedule(db, req.userId as number, b.id, date, warnings);
  }

  res.status(201).json({ event: created, warnings });
});

// PUT update an event
router.put('/:id', (req, res) => {
  const eventId = req.params.id;
  const event = db.prepare('SELECT user_id FROM events WHERE id = ?').get(eventId) as any;
  if (!event || event.user_id !== req.userId) return res.status(403).json({ message: 'Forbidden' });

  const { title, description, date, start_time, end_time, color } = req.body;
  
  db.prepare(`
    UPDATE events
    SET title = ?, description = ?, date = ?, start_time = ?, end_time = ?, color = ?
    WHERE id = ?
  `).run(title, description || '', date, start_time || null, end_time || null, color || '#3B82F6', eventId);

  const updated = db.prepare('SELECT * FROM events WHERE id = ?').get(eventId);

  // Recalculate schedules for BOTH old and new dates if they changed
  const warnings: string[] = [];
  
  const datesToRecalc = new Set([event.date, date]);
  for (const d of datesToRecalc) {
    if (!d) continue;
    const blocks = db.prepare(`
      SELECT sb.id FROM scheduled_blocks sb
      JOIN scheduled_experiments se ON sb.scheduled_experiment_id = se.id
      WHERE se.user_id = ? AND sb.scheduled_date = ?
    `).all(req.userId, d) as any[];

    for (const b of blocks) {
      recalculateBlockSchedule(db, req.userId as number, b.id, d, warnings);
    }
  }

  res.json({ event: updated, warnings });
});

// DELETE an event
router.delete('/:id', (req, res) => {
  const eventId = req.params.id;
  const event = db.prepare('SELECT user_id, date FROM events WHERE id = ?').get(eventId) as any;
  if (!event || event.user_id !== req.userId) return res.status(403).json({ message: 'Forbidden' });

  db.prepare('DELETE FROM events WHERE id = ?').run(eventId);

  const warnings: string[] = [];
  const blocks = db.prepare(`
    SELECT sb.id FROM scheduled_blocks sb
    JOIN scheduled_experiments se ON sb.scheduled_experiment_id = se.id
    WHERE se.user_id = ? AND sb.scheduled_date = ?
  `).all(req.userId, event.date) as any[];

  for (const b of blocks) {
    recalculateBlockSchedule(db, req.userId as number, b.id, event.date, warnings);
  }

  res.json({ message: 'Deleted', warnings });
});

export default router;
