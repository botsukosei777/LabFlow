import { Router } from 'express';
import db from '../db/database.js';
import { getLocalTodayStr, subtractDays } from '../utils/date.js';

const router = Router();

// GET all routines
router.get('/', (req, res) => {
  const routines = db.prepare(
    'SELECT * FROM routine_tasks WHERE user_id = ? ORDER BY created_at DESC'
  ).all(req.userId);
  res.json(routines);
});

// GET overdue routines (past 7 days)
router.get('/overdue', (req, res) => {
  const today = getLocalTodayStr();
  const routines = db.prepare('SELECT * FROM routine_tasks WHERE is_active = 1 AND user_id = ?').all(req.userId) as any[];
  
  const overdue: any[] = [];
  
  for (const r of routines) {
    // Check past 7 days
    for (let i = 1; i <= 7; i++) {
      const checkDate = subtractDays(today, i);
      if (r.start_date && checkDate < r.start_date) continue;
      if (r.end_date && checkDate > r.end_date) continue;
      
      const d = new Date(checkDate);
      const dayOfWeek = d.getDay();
      
      let shouldRun = false;
      if (r.recurrence === 'daily') shouldRun = true;
      else if (r.recurrence === 'weekdays') shouldRun = dayOfWeek >= 1 && dayOfWeek <= 5;
      else if (r.recurrence === 'weekly') {
        const days = JSON.parse(r.recurrence_days || '[]');
        shouldRun = days.includes(dayOfWeek);
      }
      
      if (shouldRun) {
        const completion = db.prepare('SELECT * FROM routine_completions WHERE routine_task_id = ? AND date = ?').get(r.id, checkDate);
        if (!completion) {
          overdue.push({
            ...r,
            missed_date: checkDate
          });
        }
      }
    }
  }
  
  res.json(overdue);
});

// GET today's routines with completion status
router.get('/today', (req, res) => {
  const today = getLocalTodayStr();
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

// POST complete routine
router.post('/:id/complete', (req, res) => {
  const targetDate = req.body.date || getLocalTodayStr();
  try {
    // Verify routine belongs to user
    const routine = db.prepare('SELECT id FROM routine_tasks WHERE id = ? AND user_id = ?').get(req.params.id, req.userId);
    if (!routine) return res.status(403).json({ message: 'Forbidden' });

    const existing = db.prepare('SELECT * FROM routine_completions WHERE routine_task_id = ? AND date = ?').get(req.params.id, targetDate);
    if (existing) {
      return res.status(409).json({ message: 'Already completed on this date' });
    }
    db.prepare('INSERT INTO routine_completions (routine_task_id, date) VALUES (?, ?)')
      .run(req.params.id, targetDate);
    res.json({ message: 'Completed' });
  } catch (error) {
    res.status(500).json({ error: 'Failed to complete routine' });
  }
});
// PUT incomplete routine for today
router.put('/:id/incomplete', (req, res) => {
  const today = getLocalTodayStr();
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
