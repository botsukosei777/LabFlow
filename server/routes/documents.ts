import { Router } from 'express';
import db from '../db/database.js';

const router = Router();

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
      INSERT INTO documents (user_id, title, content, tags, linked_experiment_type_ids, linked_literature_ids)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(
      req.userId,
      title.trim(),
      content || '',
      tagsJson,
      expJson,
      litJson
    );

    const created = db.prepare(`SELECT * FROM documents WHERE id = ?`).get(result.lastInsertRowid) as any;
    res.status(201).json({
      ...created,
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

    const doc = db.prepare(`SELECT id FROM documents WHERE id = ? AND user_id = ?`).get(req.params.id, req.userId);
    if (!doc) {
      return res.status(404).json({ message: 'ドキュメントが見つかりませんでした' });
    }

    const tagsJson = JSON.stringify(Array.isArray(tags) ? tags : []);
    const expJson = JSON.stringify(Array.isArray(linked_experiment_type_ids) ? linked_experiment_type_ids : []);
    const litJson = JSON.stringify(Array.isArray(linked_literature_ids) ? linked_literature_ids : []);

    db.prepare(`
      UPDATE documents
      SET title = ?, content = ?, tags = ?, linked_experiment_type_ids = ?, linked_literature_ids = ?, updated_at = datetime('now', 'localtime')
      WHERE id = ? AND user_id = ?
    `).run(
      title.trim(),
      content || '',
      tagsJson,
      expJson,
      litJson,
      req.params.id,
      req.userId
    );

    const updated = db.prepare(`SELECT * FROM documents WHERE id = ?`).get(req.params.id) as any;
    res.json({
      ...updated,
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
