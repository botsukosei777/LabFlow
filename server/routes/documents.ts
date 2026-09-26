import { Router } from 'express';
import db from '../db/database.js';
import fs from 'fs';
import path from 'path';

const router = Router();
const DOCUMENTS_DIR = path.join(process.cwd(), 'data', 'documents');

// Ensure directory exists
if (!fs.existsSync(DOCUMENTS_DIR)) {
  fs.mkdirSync(DOCUMENTS_DIR, { recursive: true });
}

// Generate cross-platform safe filename for markdown file
export const safeDocumentFilename = (title: string, id: number | string) => {
  const cleanTitle = (title || 'untitled')
    .replace(/[\\/:*?"<>|\r\n\t]/g, '_')
    .replace(/\s+/g, ' ')
    .trim()
    .substring(0, 60) || 'document';
  return `${id}_${cleanTitle}.md`;
};

// Helper: sync DB document to .md file
export function syncDocumentToFile(doc: any): string {
  try {
    if (!fs.existsSync(DOCUMENTS_DIR)) {
      fs.mkdirSync(DOCUMENTS_DIR, { recursive: true });
    }
    const fileName = doc.file_path || safeDocumentFilename(doc.title, doc.id);
    const fullPath = path.join(DOCUMENTS_DIR, fileName);
    if (!fs.existsSync(fullPath)) {
      fs.writeFileSync(fullPath, doc.content || '', 'utf8');
    }
    if (doc.file_path !== fileName) {
      db.prepare(`UPDATE documents SET file_path = ? WHERE id = ?`).run(fileName, doc.id);
      doc.file_path = fileName;
    }
    return fileName;
  } catch (err) {
    console.error(`[Documents] Error syncing doc ${doc.id} to file:`, err);
    return doc.file_path || '';
  }
}

// Startup check: sync all existing documents without files or file_path
try {
  const existingDocs = db.prepare(`SELECT * FROM documents`).all() as any[];
  for (const doc of existingDocs) {
    syncDocumentToFile(doc);
  }
} catch (e) {
  // DB might be initializing
}

// Helper: safe JSON parse
function safeJsonParse<T>(val: any, fallback: T): T {
  if (Array.isArray(val) || (val !== null && typeof val === 'object')) return val ?? fallback;
  if (!val || typeof val !== 'string') return fallback;
  try {
    return JSON.parse(val);
  } catch {
    return fallback;
  }
}

// GET /api/documents - list documents for user
router.get('/', (req, res) => {
  try {
    const { search, tag } = req.query;
    let query = `
      SELECT d.*
      FROM documents d
      WHERE d.user_id = ?
    `;
    const params: any[] = [req.userId];

    if (search && typeof search === 'string') {
      query += ` AND (d.title LIKE ? OR d.content LIKE ?)`;
      params.push(`%${search.trim()}%`, `%${search.trim()}%`);
    }

    query += ` ORDER BY d.updated_at DESC`;

    const rawDocs = db.prepare(query).all(...params) as any[];

    // Fetch all experiment_types and literature for quick lookup
    const allExpTypes = db.prepare(`SELECT id, name, color FROM experiment_types WHERE user_id = ?`).all(req.userId) as any[];
    const expMap = new Map(allExpTypes.map(e => [e.id, e]));

    const allLit = db.prepare(`SELECT id, title, authors, year, journal FROM literature WHERE user_id = ?`).all(req.userId) as any[];
    const litMap = new Map(allLit.map(l => [l.id, l]));

    let documents = rawDocs.map(doc => {
      // Sync or read from local .md file if available
      if (doc.file_path) {
        const fullPath = path.join(DOCUMENTS_DIR, doc.file_path);
        if (fs.existsSync(fullPath)) {
          try {
            doc.content = fs.readFileSync(fullPath, 'utf8');
          } catch (e) {
            // Keep DB content fallback
          }
        } else {
          syncDocumentToFile(doc);
        }
      } else {
        syncDocumentToFile(doc);
      }

      const tags = safeJsonParse<string[]>(doc.tags, []);
      const linkedExpIds = safeJsonParse<number[]>(doc.linked_experiment_type_ids, []);
      const linkedLitIds = safeJsonParse<number[]>(doc.linked_literature_ids, []);

      return {
        ...doc,
        tags,
        linked_experiment_type_ids: linkedExpIds,
        linked_literature_ids: linkedLitIds,
        linked_experiment_types: linkedExpIds.map(id => expMap.get(id)).filter(Boolean),
        linked_literatures: linkedLitIds.map(id => litMap.get(id)).filter(Boolean),
      };
    });

    if (tag && typeof tag === 'string') {
      const targetTag = tag.trim().toLowerCase();
      documents = documents.filter(d => d.tags.some((t: string) => t.toLowerCase() === targetTag));
    }

    res.json(documents);
  } catch (err: any) {
    console.error('Error fetching documents:', err);
    res.status(500).json({ message: 'ドキュメント一覧の取得に失敗しました', error: err.message });
  }
});

// GET /api/documents/tags - list unique tags
router.get('/tags', (req, res) => {
  try {
    const rawDocs = db.prepare(`SELECT tags FROM documents WHERE user_id = ?`).all(req.userId) as any[];
    const tagSet = new Set<string>();
    for (const doc of rawDocs) {
      const tags = safeJsonParse<string[]>(doc.tags, []);
      for (const t of tags) {
        if (t && typeof t === 'string' && t.trim()) {
          tagSet.add(t.trim());
        }
      }
    }
    res.json(Array.from(tagSet).sort());
  } catch (err: any) {
    console.error('Error fetching document tags:', err);
    res.status(500).json({ message: 'タグの取得に失敗しました' });
  }
});

// GET /api/documents/:id - single document with details
router.get('/:id', (req, res) => {
  try {
    const doc = db.prepare(`SELECT * FROM documents WHERE id = ? AND user_id = ?`).get(req.params.id, req.userId) as any;
    if (!doc) {
      return res.status(404).json({ message: 'ドキュメントが見つかりませんでした' });
    }

    // Read latest from file if exists
    if (doc.file_path) {
      const fullPath = path.join(DOCUMENTS_DIR, doc.file_path);
      if (fs.existsSync(fullPath)) {
        try {
          doc.content = fs.readFileSync(fullPath, 'utf8');
        } catch (e) {
          // Keep DB fallback
        }
      } else {
        syncDocumentToFile(doc);
      }
    } else {
      syncDocumentToFile(doc);
    }

    const tags = safeJsonParse<string[]>(doc.tags, []);
    const linkedExpIds = safeJsonParse<number[]>(doc.linked_experiment_type_ids, []);
    const linkedLitIds = safeJsonParse<number[]>(doc.linked_literature_ids, []);

    const allExpTypes = db.prepare(`SELECT * FROM experiment_types WHERE user_id = ?`).all(req.userId) as any[];
    const expMap = new Map(allExpTypes.map(e => [e.id, e]));

    const allLit = db.prepare(`SELECT * FROM literature WHERE user_id = ?`).all(req.userId) as any[];
    const litMap = new Map(allLit.map(l => [l.id, l]));

    res.json({
      ...doc,
      tags,
      linked_experiment_type_ids: linkedExpIds,
      linked_literature_ids: linkedLitIds,
      linked_experiment_types: linkedExpIds.map(id => expMap.get(id)).filter(Boolean),
      linked_literatures: linkedLitIds.map(id => litMap.get(id)).filter(Boolean),
    });
  } catch (err: any) {
    console.error('Error fetching document:', err);
    res.status(500).json({ message: 'ドキュメントの取得に失敗しました' });
  }
});

// POST /api/documents - create new document
router.post('/', (req, res) => {
  try {
    const { title, content, tags, linked_experiment_type_ids, linked_literature_ids } = req.body;
    if (!title || !title.trim()) {
      return res.status(400).json({ message: 'タイトルを入力してください' });
    }

    const tagsJson = JSON.stringify(Array.isArray(tags) ? tags : []);
    const expJson = JSON.stringify(Array.isArray(linked_experiment_type_ids) ? linked_experiment_type_ids : []);
    const litJson = JSON.stringify(Array.isArray(linked_literature_ids) ? linked_literature_ids : []);

    const result = db.prepare(`
      INSERT INTO documents (user_id, title, content, tags, linked_experiment_type_ids, linked_literature_ids, file_path)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(
      req.userId,
      title.trim(),
      content || '',
      tagsJson,
      expJson,
      litJson,
      ''
    );

    const newId = Number(result.lastInsertRowid);
    const fileName = safeDocumentFilename(title, newId);
    const fullPath = path.join(DOCUMENTS_DIR, fileName);

    try {
      fs.writeFileSync(fullPath, content || '', 'utf8');
      db.prepare(`UPDATE documents SET file_path = ? WHERE id = ?`).run(fileName, newId);
    } catch (fsErr) {
      console.error('[Documents] Failed to write markdown file:', fsErr);
    }

    const created = db.prepare(`SELECT * FROM documents WHERE id = ?`).get(newId) as any;
    res.status(201).json({
      ...created,
      content: content || '',
      file_path: fileName,
      tags: safeJsonParse<string[]>(created.tags, []),
      linked_experiment_type_ids: safeJsonParse<number[]>(created.linked_experiment_type_ids, []),
      linked_literature_ids: safeJsonParse<number[]>(created.linked_literature_ids, [])
    });
  } catch (err: any) {
    console.error('Error creating document:', err);
    res.status(500).json({ message: 'ドキュメントの作成に失敗しました', error: err.message });
  }
});

// PUT /api/documents/:id - update document
router.put('/:id', (req, res) => {
  try {
    const { title, content, tags, linked_experiment_type_ids, linked_literature_ids } = req.body;
    if (!title || !title.trim()) {
      return res.status(400).json({ message: 'タイトルを入力してください' });
    }

    const existing = db.prepare(`SELECT id, title, file_path FROM documents WHERE id = ? AND user_id = ?`).get(req.params.id, req.userId) as any;
    if (!existing) {
      return res.status(404).json({ message: 'ドキュメントが見つかりませんでした' });
    }

    const tagsJson = JSON.stringify(Array.isArray(tags) ? tags : []);
    const expJson = JSON.stringify(Array.isArray(linked_experiment_type_ids) ? linked_experiment_type_ids : []);
    const litJson = JSON.stringify(Array.isArray(linked_literature_ids) ? linked_literature_ids : []);

    const targetFileName = safeDocumentFilename(title, req.params.id);
    if (existing.file_path && existing.file_path !== targetFileName) {
      const oldPath = path.join(DOCUMENTS_DIR, existing.file_path);
      if (fs.existsSync(oldPath)) {
        try { fs.unlinkSync(oldPath); } catch (e) {}
      }
    }

    const fullPath = path.join(DOCUMENTS_DIR, targetFileName);
    try {
      fs.writeFileSync(fullPath, content || '', 'utf8');
    } catch (fsErr) {
      console.error('[Documents] Failed to update markdown file:', fsErr);
    }

    db.prepare(`
      UPDATE documents
      SET title = ?, content = ?, tags = ?, linked_experiment_type_ids = ?, linked_literature_ids = ?, file_path = ?, updated_at = datetime('now', 'localtime')
      WHERE id = ? AND user_id = ?
    `).run(
      title.trim(),
      content || '',
      tagsJson,
      expJson,
      litJson,
      targetFileName,
      req.params.id,
      req.userId
    );

    const updated = db.prepare(`SELECT * FROM documents WHERE id = ?`).get(req.params.id) as any;
    res.json({
      ...updated,
      content: content || '',
      file_path: targetFileName,
      tags: safeJsonParse<string[]>(updated.tags, []),
      linked_experiment_type_ids: safeJsonParse<number[]>(updated.linked_experiment_type_ids, []),
      linked_literature_ids: safeJsonParse<number[]>(updated.linked_literature_ids, [])
    });
  } catch (err: any) {
    console.error('Error updating document:', err);
    res.status(500).json({ message: 'ドキュメントの更新に失敗しました', error: err.message });
  }
});

// DELETE /api/documents/:id - delete document
router.delete('/:id', (req, res) => {
  try {
    const existing = db.prepare(`SELECT id, file_path FROM documents WHERE id = ? AND user_id = ?`).get(req.params.id, req.userId) as any;
    if (!existing) {
      return res.status(404).json({ message: 'ドキュメントが見つかりませんでした' });
    }

    if (existing.file_path) {
      const fullPath = path.join(DOCUMENTS_DIR, existing.file_path);
      if (fs.existsSync(fullPath)) {
        try { fs.unlinkSync(fullPath); } catch (e) {}
      }
    }

    const result = db.prepare(`DELETE FROM documents WHERE id = ? AND user_id = ?`).run(req.params.id, req.userId);
    if (result.changes === 0) {
      return res.status(404).json({ message: 'ドキュメントが見つかりませんでした' });
    }
    res.json({ success: true });
  } catch (err: any) {
    console.error('Error deleting document:', err);
    res.status(500).json({ message: 'ドキュメントの削除に失敗しました' });
  }
});

export default router;
