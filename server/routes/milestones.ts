import { Router } from 'express';
import db from '../db/database.js';

const router = Router();

// Helper: Get or create the user's dedicated "独立タスク" (standalone) milestone
function getOrCreateStandaloneMilestone(userId: number): number {
  const ms = db.prepare('SELECT id FROM milestones WHERE user_id = ? AND is_standalone = 1').get(userId) as any;
  if (!ms) {
    const res = db.prepare(
      'INSERT INTO milestones (user_id, name, description, deadline, status, is_standalone) VALUES (?, ?, ?, ?, ?, ?)'
    ).run(userId, '独立タスク', 'マイルストーンに紐付かない独立したタスク', null, 'active', 1);
    return Number(res.lastInsertRowid);
  }
  return ms.id;
}

// GET all milestones with items and sub_items
router.get('/', (req, res) => {
  const status = req.query.status as string || 'active';
  const milestones = db.prepare(
    'SELECT * FROM milestones WHERE status = ? AND user_id = ? ORDER BY is_standalone ASC, deadline ASC'
  ).all(status, req.userId) as any[];
  
  for (const ms of milestones) {
    ms.items = db.prepare(`
      SELECT mi.*, 
        l.title as literature_title, 
        l.authors as literature_authors, 
        l.journal as literature_journal, 
        l.year as literature_year, 
        l.doi as literature_doi, 
        l.read_abstract as literature_read_abstract, 
        l.read_body as literature_read_body,
        l.pdf_filename as literature_pdf_filename
      FROM milestone_items mi
      LEFT JOIN literature l ON mi.literature_id = l.id
      WHERE mi.milestone_id = ?
      ORDER BY mi.order_index
    `).all(ms.id);
    for (const item of ms.items) {
      item.sub_items = db.prepare(`
        SELECT msi.*, 
          l.title as literature_title, 
          l.authors as literature_authors, 
          l.journal as literature_journal, 
          l.year as literature_year, 
          l.doi as literature_doi, 
          l.read_abstract as literature_read_abstract, 
          l.read_body as literature_read_body,
          l.pdf_filename as literature_pdf_filename
        FROM milestone_sub_items msi
        LEFT JOIN literature l ON msi.literature_id = l.id
        WHERE msi.milestone_item_id = ?
        ORDER BY msi.order_index
      `).all(item.id);
    }
  }
  
  res.json(milestones);
});

// POST create milestone
router.post('/', (req, res) => {
  const { name, description, deadline } = req.body;
  if (!name) return res.status(400).json({ message: 'Name is required' });
  const result = db.prepare(
    'INSERT INTO milestones (user_id, name, description, deadline) VALUES (?, ?, ?, ?)'
  ).run(req.userId, name, description || '', deadline || null);
  const created = db.prepare('SELECT * FROM milestones WHERE id = ? AND user_id = ?').get(result.lastInsertRowid, req.userId);
  res.status(201).json(created);
});

// PUT update milestone
router.put('/:id', (req, res) => {
  const { name, description, deadline, status } = req.body;
  db.prepare(
    `UPDATE milestones SET name = ?, description = ?, deadline = ?, status = ?, updated_at = datetime('now', 'localtime') WHERE id = ? AND user_id = ?`
  ).run(name, description, deadline, status, req.params.id, req.userId);
  const updated = db.prepare('SELECT * FROM milestones WHERE id = ? AND user_id = ?').get(req.params.id, req.userId);
  res.json(updated);
});

// DELETE milestone
router.delete('/:id', (req, res) => {
  db.prepare('DELETE FROM milestones WHERE id = ? AND user_id = ?').run(req.params.id, req.userId);
  res.status(204).send();
});

// POST add milestone item (direct or standalone)
router.post('/items', (req, res) => {
  const { milestone_id, name, data_type, target_count, unit, priority, literature_id } = req.body;
  if (!name) return res.status(400).json({ message: 'Name is required' });
  
  let targetMsId: number;
  if (!milestone_id || milestone_id === 'standalone' || milestone_id === 0) {
    targetMsId = getOrCreateStandaloneMilestone(req.userId);
  } else {
    targetMsId = Number(milestone_id);
    const ms = db.prepare('SELECT id FROM milestones WHERE id = ? AND user_id = ?').get(targetMsId, req.userId);
    if (!ms) return res.status(403).json({ message: 'Forbidden' });
  }

  const validPriority = ['NOW', 'NEXT', 'LATER', 'IDEAS'].includes(priority) ? priority : 'NEXT';
  const max = db.prepare(
    'SELECT COALESCE(MAX(order_index), -1) as max_idx FROM milestone_items WHERE milestone_id = ?'
  ).get(targetMsId) as any;
  
  const result = db.prepare(
    'INSERT INTO milestone_items (milestone_id, name, data_type, target_count, unit, priority, literature_id, order_index) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
  ).run(targetMsId, name, data_type || 'qualitative', target_count || 1, unit || '', validPriority, literature_id || null, (max?.max_idx ?? -1) + 1);
  
  const created = db.prepare(`
    SELECT mi.*, 
      l.title as literature_title, 
      l.authors as literature_authors, 
      l.journal as literature_journal, 
      l.year as literature_year, 
      l.doi as literature_doi, 
      l.read_abstract as literature_read_abstract, 
      l.read_body as literature_read_body,
      l.pdf_filename as literature_pdf_filename
    FROM milestone_items mi
    LEFT JOIN literature l ON mi.literature_id = l.id
    WHERE mi.id = ?
  `).get(result.lastInsertRowid) as any;
  created.sub_items = [];
  res.status(201).json(created);
});

// POST add items from literature
router.post('/items/from-literature', (req, res) => {
  const { milestone_id, literature_ids, task_type = 'body', priority = 'NEXT' } = req.body;
  if (!literature_ids || !Array.isArray(literature_ids) || literature_ids.length === 0) {
    return res.status(400).json({ message: 'literature_ids is required' });
  }
  
  let targetMsId: number;
  if (!milestone_id || milestone_id === 'standalone' || milestone_id === 0) {
    targetMsId = getOrCreateStandaloneMilestone(req.userId);
  } else {
    targetMsId = Number(milestone_id);
    const ms = db.prepare('SELECT id FROM milestones WHERE id = ? AND user_id = ?').get(targetMsId, req.userId);
    if (!ms) return res.status(403).json({ message: 'Forbidden' });
  }

  const validPriority = ['NOW', 'NEXT', 'LATER', 'IDEAS'].includes(priority) ? priority : 'NEXT';
  const createdItems: any[] = [];

  for (const litId of literature_ids) {
    const lit = db.prepare('SELECT * FROM literature WHERE id = ? AND user_id = ?').get(litId, req.userId) as any;
    if (!lit) continue;

    const prefix = task_type === 'abstract' ? '【要旨確認】' : '【論文精読】';
    const authorsShort = lit.authors ? lit.authors.split(',')[0]?.trim() || lit.authors : '';
    const yearStr = lit.year ? ` (${lit.year})` : '';
    const taskName = `${prefix} ${lit.title}${authorsShort ? ` - ${authorsShort}${yearStr}` : ''}`;

    const max = db.prepare(
      'SELECT COALESCE(MAX(order_index), -1) as max_idx FROM milestone_items WHERE milestone_id = ?'
    ).get(targetMsId) as any;

    const result = db.prepare(
      'INSERT INTO milestone_items (milestone_id, name, data_type, target_count, unit, priority, literature_id, order_index) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
    ).run(targetMsId, taskName, 'task', 1, '', validPriority, lit.id, (max?.max_idx ?? -1) + 1);

    const created = db.prepare(`
      SELECT mi.*, 
        l.title as literature_title, 
        l.authors as literature_authors, 
        l.journal as literature_journal, 
        l.year as literature_year, 
        l.doi as literature_doi, 
        l.read_abstract as literature_read_abstract, 
        l.read_body as literature_read_body,
        l.pdf_filename as literature_pdf_filename
      FROM milestone_items mi
      LEFT JOIN literature l ON mi.literature_id = l.id
      WHERE mi.id = ?
    `).get(result.lastInsertRowid) as any;
    created.sub_items = [];
    createdItems.push(created);
  }

  res.status(201).json(createdItems);
});

// POST add milestone item under milestone ID (or 'standalone')
router.post('/:id/items', (req, res) => {
  const { name, data_type, target_count, unit, priority, literature_id } = req.body;
  if (!name) return res.status(400).json({ message: 'Name is required' });
  
  let targetMsId: number;
  if (req.params.id === 'standalone' || req.params.id === '0') {
    targetMsId = getOrCreateStandaloneMilestone(req.userId);
  } else {
    targetMsId = Number(req.params.id);
    const ms = db.prepare('SELECT id FROM milestones WHERE id = ? AND user_id = ?').get(targetMsId, req.userId);
    if (!ms) return res.status(403).json({ message: 'Forbidden' });
  }

  const validPriority = ['NOW', 'NEXT', 'LATER', 'IDEAS'].includes(priority) ? priority : 'NEXT';
  const max = db.prepare(
    'SELECT COALESCE(MAX(order_index), -1) as max_idx FROM milestone_items WHERE milestone_id = ?'
  ).get(targetMsId) as any;
  
  const result = db.prepare(
    'INSERT INTO milestone_items (milestone_id, name, data_type, target_count, unit, priority, literature_id, order_index) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
  ).run(targetMsId, name, data_type || 'qualitative', target_count || 1, unit || '', validPriority, literature_id || null, (max?.max_idx ?? -1) + 1);
  
  const created = db.prepare(`
    SELECT mi.*, 
      l.title as literature_title, 
      l.authors as literature_authors, 
      l.journal as literature_journal, 
      l.year as literature_year, 
      l.doi as literature_doi, 
      l.read_abstract as literature_read_abstract, 
      l.read_body as literature_read_body,
      l.pdf_filename as literature_pdf_filename
    FROM milestone_items mi
    LEFT JOIN literature l ON mi.literature_id = l.id
    WHERE mi.id = ?
  `).get(result.lastInsertRowid) as any;
  created.sub_items = [];
  res.status(201).json(created);
});

// PUT update milestone item
router.put('/items/:itemId', (req, res) => {
  const { name, data_type, target_count, current_count, unit, is_completed, priority, milestone_id, literature_id } = req.body;
  
  // Verify item belongs to user's milestone
  const item = db.prepare(`
    SELECT m.user_id, i.milestone_id, i.priority, i.literature_id
    FROM milestone_items i 
    JOIN milestones m ON i.milestone_id = m.id 
    WHERE i.id = ?
  `).get(req.params.itemId) as any;
  
  if (!item || item.user_id !== req.userId) return res.status(403).json({ message: 'Forbidden' });
  
  let targetMsId = item.milestone_id;
  if (milestone_id !== undefined) {
    if (milestone_id === 'standalone' || milestone_id === 0) {
      targetMsId = getOrCreateStandaloneMilestone(req.userId);
    } else {
      const newMs = db.prepare('SELECT id FROM milestones WHERE id = ? AND user_id = ?').get(milestone_id, req.userId);
      if (newMs) targetMsId = Number(milestone_id);
    }
  }

  // Auto-complete quantitative items when target reached
  let completed = is_completed;
  if (data_type === 'quantitative' && current_count !== undefined && target_count !== undefined) {
    completed = current_count >= target_count ? 1 : 0;
  }

  const validPriority = priority && ['NOW', 'NEXT', 'LATER', 'IDEAS'].includes(priority) ? priority : item.priority;
  const newLitId = literature_id !== undefined ? (literature_id || null) : item.literature_id;

  db.prepare(
    `UPDATE milestone_items SET 
      milestone_id = ?,
      name = ?, 
      data_type = ?, 
      target_count = ?, 
      current_count = ?, 
      unit = ?, 
      is_completed = ?, 
      priority = ?,
      literature_id = ?,
      updated_at = datetime('now', 'localtime')
     WHERE id = ?`
  ).run(targetMsId, name, data_type, target_count, current_count || 0, unit || '', completed ? 1 : 0, validPriority, newLitId, req.params.itemId);

  // If item completed and has literature_id, sync literature read status
  if (completed && newLitId) {
    try {
      db.prepare('UPDATE literature SET read_body = 1, updated_at = datetime(\'now\', \'localtime\') WHERE id = ? AND user_id = ?').run(newLitId, req.userId);
    } catch (e) {}
  }
  
  const updated = db.prepare(`
    SELECT mi.*, 
      l.title as literature_title, 
      l.authors as literature_authors, 
      l.journal as literature_journal, 
      l.year as literature_year, 
      l.doi as literature_doi, 
      l.read_abstract as literature_read_abstract, 
      l.read_body as literature_read_body,
      l.pdf_filename as literature_pdf_filename
    FROM milestone_items mi
    LEFT JOIN literature l ON mi.literature_id = l.id
    WHERE mi.id = ?
  `).get(req.params.itemId) as any;
  updated.sub_items = db.prepare(`
    SELECT msi.*, 
      l.title as literature_title, 
      l.authors as literature_authors, 
      l.journal as literature_journal, 
      l.year as literature_year, 
      l.doi as literature_doi, 
      l.read_abstract as literature_read_abstract, 
      l.read_body as literature_read_body,
      l.pdf_filename as literature_pdf_filename
    FROM milestone_sub_items msi
    LEFT JOIN literature l ON msi.literature_id = l.id
    WHERE msi.milestone_item_id = ?
    ORDER BY msi.order_index
  `).all(req.params.itemId);
  res.json(updated);
});

// PUT quick priority change for milestone item
router.put('/items/:itemId/priority', (req, res) => {
  const { priority } = req.body;
  if (!['NOW', 'NEXT', 'LATER', 'IDEAS'].includes(priority)) {
    return res.status(400).json({ message: 'Invalid priority' });
  }
  
  const item = db.prepare(`
    SELECT m.user_id 
    FROM milestone_items i 
    JOIN milestones m ON i.milestone_id = m.id 
    WHERE i.id = ?
  `).get(req.params.itemId) as any;
  
  if (!item || item.user_id !== req.userId) return res.status(403).json({ message: 'Forbidden' });
  
  db.prepare(
    `UPDATE milestone_items SET priority = ?, updated_at = datetime('now', 'localtime') WHERE id = ?`
  ).run(priority, req.params.itemId);
  
  const updated = db.prepare('SELECT * FROM milestone_items WHERE id = ?').get(req.params.itemId) as any;
  updated.sub_items = db.prepare('SELECT * FROM milestone_sub_items WHERE milestone_item_id = ? ORDER BY order_index').all(req.params.itemId);
  res.json(updated);
});

// DELETE milestone item
router.delete('/items/:itemId', (req, res) => {
  // Verify item belongs to user's milestone
  const item = db.prepare(`
    SELECT m.user_id 
    FROM milestone_items i 
    JOIN milestones m ON i.milestone_id = m.id 
    WHERE i.id = ?
  `).get(req.params.itemId) as any;
  
  if (!item || item.user_id !== req.userId) return res.status(403).json({ message: 'Forbidden' });
  
  db.prepare('DELETE FROM milestone_items WHERE id = ?').run(req.params.itemId);
  res.status(204).send();
});

// POST add subitem
router.post('/items/:itemId/subitems', (req, res) => {
  const { name, data_type = 'qualitative', target_count = 1, unit = '', priority = 'NEXT', literature_id } = req.body;
  if (!name) return res.status(400).json({ message: 'Name is required' });
  
  const item = db.prepare(`
    SELECT m.user_id 
    FROM milestone_items i 
    JOIN milestones m ON i.milestone_id = m.id 
    WHERE i.id = ?
  `).get(req.params.itemId) as any;
  
  if (!item || item.user_id !== req.userId) return res.status(403).json({ message: 'Forbidden' });

  const validPriority = ['NOW', 'NEXT', 'LATER', 'IDEAS'].includes(priority) ? priority : 'NEXT';
  const max = db.prepare('SELECT COALESCE(MAX(order_index), -1) as max_idx FROM milestone_sub_items WHERE milestone_item_id = ?').get(req.params.itemId) as any;
  const result = db.prepare('INSERT INTO milestone_sub_items (milestone_item_id, name, data_type, target_count, unit, priority, literature_id, order_index) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
    .run(req.params.itemId, name, data_type, target_count, unit, validPriority, literature_id || null, (max?.max_idx ?? -1) + 1);
    
  const created = db.prepare(`
    SELECT msi.*, 
      l.title as literature_title, 
      l.authors as literature_authors, 
      l.journal as literature_journal, 
      l.year as literature_year, 
      l.doi as literature_doi, 
      l.read_abstract as literature_read_abstract, 
      l.read_body as literature_read_body,
      l.pdf_filename as literature_pdf_filename
    FROM milestone_sub_items msi
    LEFT JOIN literature l ON msi.literature_id = l.id
    WHERE msi.id = ?
  `).get(result.lastInsertRowid);
  res.status(201).json(created);
});

// PUT update subitem
router.put('/subitems/:id', (req, res) => {
  const { name, is_completed, current_count, unit, priority, literature_id } = req.body;
  
  const subitemInfo = db.prepare(`
    SELECT m.user_id, i.id as item_id, si.target_count, si.data_type, si.current_count, si.priority, si.literature_id
    FROM milestone_sub_items si 
    JOIN milestone_items i ON si.milestone_item_id = i.id 
    JOIN milestones m ON i.milestone_id = m.id 
    WHERE si.id = ?
  `).get(req.params.id) as any;
  
  if (!subitemInfo || subitemInfo.user_id !== req.userId) return res.status(403).json({ message: 'Forbidden' });
  
  let newCurrent = current_count !== undefined ? current_count : subitemInfo.current_count;
  let newCompleted = is_completed ? 1 : 0;
  
  if (subitemInfo.data_type === 'quantitative') {
    newCompleted = newCurrent >= subitemInfo.target_count ? 1 : 0;
  }

  const validPriority = priority && ['NOW', 'NEXT', 'LATER', 'IDEAS'].includes(priority) ? priority : subitemInfo.priority;
  const newLitId = literature_id !== undefined ? (literature_id || null) : subitemInfo.literature_id;
  
  db.prepare(
    `UPDATE milestone_sub_items SET 
      name = ?, 
      current_count = ?, 
      unit = ?, 
      is_completed = ?, 
      priority = ?,
      literature_id = ?,
      updated_at = datetime('now', 'localtime')
     WHERE id = ?`
  ).run(name, current_count || 0, unit || '', newCompleted ? 1 : 0, validPriority, newLitId, req.params.id);
  
  // If subitem completed and has literature_id, sync literature read status
  if (newCompleted && newLitId) {
    try {
      db.prepare('UPDATE literature SET read_body = 1, updated_at = datetime(\'now\', \'localtime\') WHERE id = ? AND user_id = ?').run(newLitId, req.userId);
    } catch (e) {}
  }

  // Auto-complete parent if all subitems are completed
  const allSubItems = db.prepare('SELECT is_completed FROM milestone_sub_items WHERE milestone_item_id = ?').all(subitemInfo.item_id) as any[];
  const allCompleted = allSubItems.length > 0 && allSubItems.every(s => s.is_completed === 1);
  if (allCompleted) {
    db.prepare('UPDATE milestone_items SET is_completed = 1 WHERE id = ?').run(subitemInfo.item_id);
  } else if (allSubItems.length > 0) {
    db.prepare('UPDATE milestone_items SET is_completed = 0 WHERE id = ?').run(subitemInfo.item_id);
  }
  
  const updated = db.prepare(`
    SELECT msi.*, 
      l.title as literature_title, 
      l.authors as literature_authors, 
      l.journal as literature_journal, 
      l.year as literature_year, 
      l.doi as literature_doi, 
      l.read_abstract as literature_read_abstract, 
      l.read_body as literature_read_body,
      l.pdf_filename as literature_pdf_filename
    FROM milestone_sub_items msi
    LEFT JOIN literature l ON msi.literature_id = l.id
    WHERE msi.id = ?
  `).get(req.params.id);
  res.json(updated);
});

// PUT quick priority change for subitem
router.put('/subitems/:id/priority', (req, res) => {
  const { priority } = req.body;
  if (!['NOW', 'NEXT', 'LATER', 'IDEAS'].includes(priority)) {
    return res.status(400).json({ message: 'Invalid priority' });
  }
  
  const subitemInfo = db.prepare(`
    SELECT m.user_id 
    FROM milestone_sub_items si 
    JOIN milestone_items i ON si.milestone_item_id = i.id 
    JOIN milestones m ON i.milestone_id = m.id 
    WHERE si.id = ?
  `).get(req.params.id) as any;
  
  if (!subitemInfo || subitemInfo.user_id !== req.userId) return res.status(403).json({ message: 'Forbidden' });
  
  db.prepare(
    `UPDATE milestone_sub_items SET priority = ?, updated_at = datetime('now', 'localtime') WHERE id = ?`
  ).run(priority, req.params.id);
  
  const updated = db.prepare(`
    SELECT msi.*, 
      l.title as literature_title, 
      l.authors as literature_authors, 
      l.journal as literature_journal, 
      l.year as literature_year, 
      l.doi as literature_doi, 
      l.read_abstract as literature_read_abstract, 
      l.read_body as literature_read_body,
      l.pdf_filename as literature_pdf_filename
    FROM milestone_sub_items msi
    LEFT JOIN literature l ON msi.literature_id = l.id
    WHERE msi.id = ?
  `).get(req.params.id);
  res.json(updated);
});

// DELETE subitem
router.delete('/subitems/:id', (req, res) => {
  const subitemInfo = db.prepare(`
    SELECT m.user_id, i.id as item_id 
    FROM milestone_sub_items si 
    JOIN milestone_items i ON si.milestone_item_id = i.id 
    JOIN milestones m ON i.milestone_id = m.id 
    WHERE si.id = ?
  `).get(req.params.id) as any;
  if (!subitemInfo || subitemInfo.user_id !== req.userId) return res.status(403).json({ message: 'Forbidden' });
  
  db.prepare('DELETE FROM milestone_sub_items WHERE id = ?').run(req.params.id);
  res.status(204).send();
});

export default router;
