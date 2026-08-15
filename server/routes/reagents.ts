import { Router } from 'express';
import db from '../db/database.js';

const router = Router();

// GET all reagents
router.get('/', (req, res) => {
  const category = req.query.category as string;
  let query = 'SELECT * FROM reagents WHERE user_id = ?';
  const params: (string | number)[] = [req.userId as number];
  
  if (category) {
    query += ' AND category = ?';
    params.push(category);
  }
  
  query += ' ORDER BY category, name';
  const reagents = db.prepare(query).all(...params);
  res.json(reagents);
});

// GET reagent alerts (low stock + depleted)
router.get('/alerts', (req, res) => {
  const alerts = db.prepare(`
    SELECT * FROM reagents
    WHERE user_id = ? AND (
       is_depleted = 1
       OR (quantity_trackable = 1 AND current_quantity <= min_quantity)
    )
    ORDER BY is_depleted DESC, current_quantity ASC
  `).all(req.userId);
  res.json(alerts);
});

// POST create reagent
router.post('/', (req, res) => {
  const { name, description, category, quantity_trackable, current_quantity, min_quantity, unit, supplier, catalog_number, location } = req.body;
  if (!name) return res.status(400).json({ message: 'Name is required' });
  
  const result = db.prepare(`
    INSERT INTO reagents (user_id, name, description, category, quantity_trackable, current_quantity, min_quantity, unit, supplier, catalog_number, location)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    req.userId, name, description || '', category || '', quantity_trackable ? 1 : 0,
    current_quantity || 0, min_quantity || 0, unit || '', supplier || '', catalog_number || '', location || ''
  );
  const created = db.prepare('SELECT * FROM reagents WHERE id = ? AND user_id = ?').get(result.lastInsertRowid, req.userId);
  res.status(201).json(created);
});

// PUT update reagent
router.put('/:id', (req, res) => {
  const { name, description, category, quantity_trackable, current_quantity, min_quantity, unit, is_depleted, supplier, catalog_number, location } = req.body;
  db.prepare(`
    UPDATE reagents SET name = ?, description = ?, category = ?, quantity_trackable = ?,
    current_quantity = ?, min_quantity = ?, unit = ?, is_depleted = ?, supplier = ?, catalog_number = ?, location = ?,
    updated_at = datetime('now', 'localtime')
    WHERE id = ? AND user_id = ?
  `).run(
    name, description, category, quantity_trackable ? 1 : 0,
    current_quantity, min_quantity, unit, is_depleted ? 1 : 0, supplier, catalog_number, location || '',
    req.params.id, req.userId
  );
  const updated = db.prepare('SELECT * FROM reagents WHERE id = ? AND user_id = ?').get(req.params.id, req.userId);
  res.json(updated);
});

// POST toggle depletion flag
router.post('/:id/deplete', (req, res) => {
  const reagent = db.prepare('SELECT is_depleted FROM reagents WHERE id = ? AND user_id = ?').get(req.params.id, req.userId) as any;
  if (!reagent) return res.status(404).json({ message: 'Not found' });
  
  const newVal = reagent.is_depleted ? 0 : 1;
  db.prepare(`UPDATE reagents SET is_depleted = ?, updated_at = datetime('now', 'localtime') WHERE id = ? AND user_id = ?`).run(newVal, req.params.id, req.userId);
  const updated = db.prepare('SELECT * FROM reagents WHERE id = ? AND user_id = ?').get(req.params.id, req.userId);
  res.json(updated);
});

// DELETE reagent
router.delete('/:id', (req, res) => {
  db.prepare('DELETE FROM reagents WHERE id = ? AND user_id = ?').run(req.params.id, req.userId);
  res.status(204).send();
});

// Link reagent to experiment type
router.post('/:id/experiments', (req, res) => {
  const { experiment_type_id, quantity_per_experiment } = req.body;
  try {
    // Verify reagent and experiment type belong to user
    const reagent = db.prepare('SELECT id FROM reagents WHERE id = ? AND user_id = ?').get(req.params.id, req.userId);
    const expType = db.prepare('SELECT id FROM experiment_types WHERE id = ? AND user_id = ?').get(experiment_type_id, req.userId);
    if (!reagent || !expType) return res.status(403).json({ message: 'Forbidden' });

    db.prepare(
      'INSERT INTO experiment_reagents (experiment_type_id, reagent_id, quantity_per_experiment) VALUES (?, ?, ?)'
    ).run(experiment_type_id, req.params.id, quantity_per_experiment || 0);
    res.status(201).json({ message: 'Linked' });
  } catch (e) {
    res.status(409).json({ message: 'Already linked' });
  }
});

export default router;
