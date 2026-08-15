import { Router } from 'express';
import db from '../db/database.js';
import fs from 'fs';
import path from 'path';

const router = Router();
const NOTEBOOK_DIR = path.join(process.cwd(), 'data', 'notebooks');

// Ensure directory exists
if (!fs.existsSync(NOTEBOOK_DIR)) {
  fs.mkdirSync(NOTEBOOK_DIR, { recursive: true });
}

const safeFilename = (title: string, date: string, id: number) => {
  const cleanTitle = title.replace(/[^a-z0-9]/gi, '_').toLowerCase().substring(0, 50);
  return `${date}_${cleanTitle}_${id}.md`;
};

// GET all notebooks
router.get('/', (req, res) => {
  const { date, scheduled_experiment_id } = req.query;
  let query = 'SELECT * FROM notebooks WHERE user_id = ?';
  const params: (string | number)[] = [req.userId as number];

  if (date) {
    query += ' AND date = ?';
    params.push(date as string);
  }
  
  if (scheduled_experiment_id) {
    query += ' AND scheduled_experiment_id = ?';
    params.push(Number(scheduled_experiment_id));
  }

  query += ' ORDER BY date DESC, updated_at DESC';

  const notebooks = db.prepare(query).all(...params) as any[];
  
  // Read from file if file_path exists
  notebooks.forEach(nb => {
    if (nb.file_path) {
      const fullPath = path.join(NOTEBOOK_DIR, nb.file_path);
      if (fs.existsSync(fullPath)) {
        nb.content = fs.readFileSync(fullPath, 'utf8');
      }
    }
  });

  res.json(notebooks);
});

// GET specific notebook
router.get('/:id', (req, res) => {
  const notebook = db.prepare('SELECT * FROM notebooks WHERE id = ? AND user_id = ?').get(req.params.id, req.userId) as any;
  if (!notebook) return res.status(404).json({ message: 'Not found' });
  
  if (notebook.file_path) {
    const fullPath = path.join(NOTEBOOK_DIR, notebook.file_path);
    if (fs.existsSync(fullPath)) {
      notebook.content = fs.readFileSync(fullPath, 'utf8');
    }
  }
  
  res.json(notebook);
});

// POST new notebook
router.post('/', (req, res) => {
  const { title, content, date, scheduled_experiment_id, tags } = req.body;
  if (!title || !date) {
    return res.status(400).json({ message: 'Title and date are required' });
  }

  const result = db.prepare(`
    INSERT INTO notebooks (user_id, title, content, date, scheduled_experiment_id, tags)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(
    req.userId,
    title,
    '', // We'll store it in file, but DB gets empty string or content
    date,
    scheduled_experiment_id || null,
    JSON.stringify(tags || [])
  );

  const newId = result.lastInsertRowid;
  const fileName = safeFilename(title, date, Number(newId));
  const fullPath = path.join(NOTEBOOK_DIR, fileName);
  
  fs.writeFileSync(fullPath, content || '', 'utf8');
  
  db.prepare(`UPDATE notebooks SET file_path = ?, content = ? WHERE id = ?`).run(fileName, content || '', newId);

  const notebook = db.prepare('SELECT * FROM notebooks WHERE id = ?').get(newId);
  res.status(201).json(notebook);
});

// PUT update notebook
router.put('/:id', (req, res) => {
  const { title, content, date, scheduled_experiment_id, tags } = req.body;
  if (!title || !date) {
    return res.status(400).json({ message: 'Title and date are required' });
  }

  const existing = db.prepare('SELECT id, file_path FROM notebooks WHERE id = ? AND user_id = ?').get(req.params.id, req.userId) as any;
  if (!existing) return res.status(403).json({ message: 'Forbidden' });

  let fileName = existing.file_path;
  if (!fileName) {
    fileName = safeFilename(title, date, Number(req.params.id));
  }
  
  const fullPath = path.join(NOTEBOOK_DIR, fileName);
  fs.writeFileSync(fullPath, content || '', 'utf8');

  db.prepare(`
    UPDATE notebooks 
    SET title = ?, content = ?, file_path = ?, date = ?, scheduled_experiment_id = ?, tags = ?, updated_at = datetime('now', 'localtime')
    WHERE id = ?
  `).run(
    title,
    content || '',
    fileName,
    date,
    scheduled_experiment_id || null,
    JSON.stringify(tags || []),
    req.params.id
  );

  const updated = db.prepare('SELECT * FROM notebooks WHERE id = ?').get(req.params.id);
  res.json(updated);
});

// DELETE notebook
router.delete('/:id', (req, res) => {
  const existing = db.prepare('SELECT id, file_path FROM notebooks WHERE id = ? AND user_id = ?').get(req.params.id, req.userId) as any;
  if (!existing) return res.status(403).json({ message: 'Forbidden' });

  if (existing.file_path) {
    const fullPath = path.join(NOTEBOOK_DIR, existing.file_path);
    if (fs.existsSync(fullPath)) {
      fs.unlinkSync(fullPath);
    }
  }

  db.prepare('DELETE FROM notebooks WHERE id = ?').run(req.params.id);
  res.json({ message: 'Notebook deleted' });
});

export default router;
