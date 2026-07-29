import { Router } from 'express';
import db from '../db/database.js';

const router = Router();

// GET all routines
router.get('/', (req, res) => {
  const routines = db.prepare(
    'SELECT * FROM routine_tasks WHERE user_id = ? ORDER BY created_at DESC'
  ).all(req.userId);
  res.json(routines);
});

// GET today's routines with completion status
router.get('/today', (req, res) => {
  const today = new Date().toISOString().split('T')[0];
  const dayOfWeek = new Date().getDay(); // 0=Sun, 1=Mon, ..., 6=Sat
  
  const routines = db.prepare(
    'SELECT * FROM routine_tasks WHERE user_id = ? AND is_active = 1'
  ).all(req.userId) as any[];
  
  const todayRoutines = routines.filter(r => {
    // Check start and end date if specified
    if (r.start_date && today < r.start_date) return false;
    if (r.end_date && today > r.end_date) return false;

    if (r.recurrence === 'daily') return true;
    if (r.recurrence === 'weekdays') return dayOfWeek >= 1 && dayOfWeek <= 5;
    if (r.recurrence === 'weekly') {
      const days = JSON.parse(r.recurrence_days || '[]');
      return days.includes(dayOfWeek);
    }
    if (r.recurrence === 'custom') {
      const days = JSON.parse(r.recurrence_days || '[]');
      return days.includes(dayOfWeek);
    }
    return false;
  });
  
  // Check completion status
  for (const routine of todayRoutines) {
    const completion = db.prepare(
      'SELECT * FROM routine_completions WHERE routine_task_id = ? AND date = ?'
    ).get(routine.id, today);
    routine.completed_today = !!completion;
  }
  
  res.json(todayRoutines);
});

// POST create routine
router.post('/', (req, res) => {
  const { name, description, recurrence, recurrence_days, start_date, end_date } = req.body;
  if (!name) return res.status(400).json({ message: 'Name is required' });
  
  const result = db.prepare(
    'INSERT INTO routine_tasks (user_id, name, description, recurrence, recurrence_days, start_date, end_date) VALUES (?, ?, ?, ?, ?, ?, ?)'
  ).run(req.userId, name, description || '', recurrence || 'daily', JSON.stringify(recurrence_days || []), start_date || null, end_date || null);
  const created = db.prepare('SELECT * FROM routine_tasks WHERE id = ? AND user_id = ?').get(result.lastInsertRowid, req.userId);
  res.status(201).json(created);
});

// PUT update routine
router.put('/:id', (req, res) => {
  const { name, description, recurrence, recurrence_days, is_active, start_date, end_date } = req.body;
  db.prepare(
    'UPDATE routine_tasks SET name = ?, description = ?, recurrence = ?, recurrence_days = ?, is_active = ?, start_date = ?, end_date = ? WHERE id = ? AND user_id = ?'
  ).run(name, description, recurrence, JSON.stringify(recurrence_days || []), is_active ? 1 : 0, start_date || null, end_date || null, req.params.id, req.userId);
  const updated = db.prepare('SELECT * FROM routine_tasks WHERE id = ? AND user_id = ?').get(req.params.id, req.userId);
  res.json(updated);
});

// POST complete routine for today
router.post('/:id/complete', (req, res) => {
  const today = new Date().toISOString().split('T')[0];
  try {
    // Verify routine belongs to user
    const routine = db.prepare('SELECT id FROM routine_tasks WHERE id = ? AND user_id = ?').get(req.params.id, req.userId);
    if (!routine) return res.status(403).json({ message: 'Forbidden' });

    db.prepare(
      'INSERT INTO routine_completions (routine_task_id, date) VALUES (?, ?)'
    ).run(req.params.id, today);
    res.json({ message: 'Completed' });
  } catch (e) {
    res.status(409).json({ message: 'Already completed today' });
  }
});
// PUT incomplete routine for today
router.put('/:id/incomplete', (req, res) => {
  const today = new Date().toISOString().split('T')[0];
  const routine = db.prepare('SELECT id FROM routine_tasks WHERE id = ? AND user_id = ?').get(req.params.id, req.userId);
  if (!routine) return res.status(403).json({ message: 'Forbidden' });

  db.prepare('DELETE FROM routine_completions WHERE routine_task_id = ? AND date = ?').run(req.params.id, today);
  res.json({ message: 'Incomplete' });
});

// DELETE routine
router.delete('/:id', (req, res) => {
  db.prepare('DELETE FROM routine_tasks WHERE id = ? AND user_id = ?').run(req.params.id, req.userId);
  res.status(204).send();
});

export default router;
