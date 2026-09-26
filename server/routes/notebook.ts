import { Router } from 'express';
import db from '../db/database.js';
import fs from 'fs';
import path from 'path';
import multer from 'multer';

const router = Router();
const NOTEBOOK_DIR = path.join(process.cwd(), 'data', 'notebooks');
const NOTEBOOK_IMAGES_DIR = path.join(process.cwd(), 'data', 'notebook_images');

// Ensure directories exist
if (!fs.existsSync(NOTEBOOK_DIR)) {
  fs.mkdirSync(NOTEBOOK_DIR, { recursive: true });
}
if (!fs.existsSync(NOTEBOOK_IMAGES_DIR)) {
  fs.mkdirSync(NOTEBOOK_IMAGES_DIR, { recursive: true });
}

// Multer storage for notebook images
const imageStorage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    cb(null, NOTEBOOK_IMAGES_DIR);
  },
  filename: (_req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
    const ext = path.extname(file.originalname).toLowerCase() || '.png';
    const baseName = path.basename(file.originalname, ext)
      .replace(/[^a-zA-Z0-9_\-\u3040-\u30ff\u3400-\u4dbf\u4e00-\u9fff]/g, '_')
      .substring(0, 40) || 'image';
    cb(null, `${baseName}_${uniqueSuffix}${ext}`);
  }
});

const imageUpload = multer({
  storage: imageStorage,
  limits: { fileSize: 50 * 1024 * 1024 }, // 50MB
  fileFilter: (_req, file, cb) => {
    if (file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(new Error('Only image files are allowed'));
    }
  }
});

// POST /api/notebook/upload-image
router.post('/upload-image', imageUpload.single('image'), (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ message: '画像ファイルがアップロードされていません' });
    }
    const filename = req.file.filename;
    res.json({
      url: `/api/notebook/images/${filename}`,
      filename,
      originalName: req.file.originalname,
      size: req.file.size,
      mimeType: req.file.mimetype,
    });
  } catch (err: any) {
    console.error('[Notebook] Image upload error:', err);
    res.status(500).json({ message: '画像の保存に失敗しました', error: err.message });
  }
});

// GET /api/notebook/images/:filename
router.get('/images/:filename', (req, res) => {
  try {
    const filename = req.params.filename;
    if (!filename || filename.includes('..') || filename.includes('/') || filename.includes('\\')) {
      return res.status(400).json({ message: 'Invalid filename' });
    }

    const filePath = path.join(NOTEBOOK_IMAGES_DIR, filename);
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ message: 'Image not found' });
    }

    res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
    res.sendFile(filePath);
  } catch (err: any) {
    console.error('[Notebook] Image serve error:', err);
    res.status(500).json({ message: 'Error serving image' });
  }
});

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
