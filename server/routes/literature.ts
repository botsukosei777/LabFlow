import { Router } from 'express';
import db from '../db/database.js';
import fs from 'fs';
import path from 'path';
import multer from 'multer';

const router = Router();
const LIT_DIR = path.join(process.cwd(), 'data', 'literature_files');

// Ensure directory exists
if (!fs.existsSync(LIT_DIR)) {
  fs.mkdirSync(LIT_DIR, { recursive: true });
}

// Multer storage configuration
const storage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    cb(null, LIT_DIR);
  },
  filename: (_req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
    const ext = path.extname(file.originalname);
    const baseName = path.basename(file.originalname, ext).replace(/[^a-zA-Z0-9_\-\u3040-\u30ff\u3400-\u4dbf\u4e00-\u9fff]/g, '_').substring(0, 40);
    cb(null, `${baseName}_${uniqueSuffix}${ext}`);
  }
});

const upload = multer({
  storage,
  limits: { fileSize: 100 * 1024 * 1024 } // 100MB max
});

// Helper: safe JSON parse for keywords
function parseKeywords(raw: any): string[] {
  if (Array.isArray(raw)) return raw;
  if (typeof raw === 'string') {
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed;
    } catch {
      return raw.split(',').map(s => s.trim()).filter(Boolean);
    }
  }
  return [];
}

// Helper: map BibTeX/RIS type to PaperType
function mapPaperType(typeStr: string): string {
  const lower = (typeStr || '').toLowerCase();
  if (lower.includes('review')) return 'review';
  if (lower.includes('letter') || lower.includes('short')) return 'letter';
  if (lower.includes('conf') || lower.includes('proceeding') || lower.includes('inproceedings')) return 'conference';
  if (lower.includes('preprint') || lower.includes('arxiv') || lower.includes('biorxiv') || lower.includes('medrxiv')) return 'preprint';
  if (lower.includes('book') || lower.includes('chapter')) return 'book_chapter';
  if (lower.includes('article') || lower.includes('jour') || lower.includes('journal')) return 'original';
  return 'other';
}

// ─── GET /api/literature ───
router.get('/', (req, res) => {
  const userId = req.userId;
  const { search, project_name, paper_type, read_status, tag, sort_by = 'created_at', order = 'DESC' } = req.query;

  let query = `SELECT * FROM literature WHERE user_id = ?`;
  const params: (string | number)[] = [userId as number];

  if (project_name) {
    query += ` AND project_name = ?`;
    params.push(project_name as string);
  }

  if (paper_type) {
    query += ` AND paper_type = ?`;
    params.push(paper_type as string);
  }

  if (read_status === 'unread') {
    query += ` AND read_abstract = 0 AND read_body = 0`;
  } else if (read_status === 'read_abstract') {
    query += ` AND read_abstract = 1`;
  } else if (read_status === 'read_body') {
    query += ` AND read_body = 1`;
  }

  if (search) {
    const s = `%${search}%`;
    query += ` AND (title LIKE ? OR authors LIKE ? OR journal LIKE ? OR lab_name LIKE ? OR doi LIKE ? OR notes LIKE ? OR abstract LIKE ? OR project_name LIKE ? OR keywords LIKE ?)`;
    params.push(s, s, s, s, s, s, s, s, s);
  }

  // Sorting
  const allowedSortCols = ['created_at', 'updated_at', 'year', 'title', 'journal', 'project_name'];
  const sortCol = allowedSortCols.includes(sort_by as string) ? (sort_by as string) : 'created_at';
  const sortOrder = (order as string).toUpperCase() === 'ASC' ? 'ASC' : 'DESC';

  query += ` ORDER BY ${sortCol} ${sortOrder}`;

  try {
    const rows = db.prepare(query).all(...params) as any[];
    const items = rows.map(r => ({
      ...r,
      read_abstract: Boolean(r.read_abstract),
      read_body: Boolean(r.read_body),
      keywords: parseKeywords(r.keywords)
    }));

    // Post-filter by tag if specified
    const result = tag
      ? items.filter(item => item.keywords.some((k: string) => k.toLowerCase() === (tag as string).toLowerCase()))
      : items;

    res.json(result);
  } catch (error) {
    console.error('Error fetching literature:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// ─── GET /api/literature/projects ───
router.get('/projects', (req, res) => {
  const userId = req.userId;
  try {
    const rows = db.prepare(`
      SELECT DISTINCT project_name 
      FROM literature 
      WHERE user_id = ? AND project_name != '' AND project_name IS NOT NULL
      ORDER BY project_name ASC
    `).all(userId) as any[];
    res.json(rows.map(r => r.project_name));
  } catch (error) {
    res.status(500).json({ message: 'Internal server error' });
  }
});

// ─── GET /api/literature/tags ───
router.get('/tags', (req, res) => {
  const userId = req.userId;
  try {
    const rows = db.prepare(`SELECT keywords FROM literature WHERE user_id = ?`).all(userId) as any[];
    const tagSet = new Set<string>();
    rows.forEach(r => {
      parseKeywords(r.keywords).forEach(k => tagSet.add(k));
    });
    res.json(Array.from(tagSet).sort());
  } catch (error) {
    res.status(500).json({ message: 'Internal server error' });
  }
});

// ─── GET /api/literature/doi-lookup ───
router.get('/doi-lookup', async (req, res) => {
  const { doi } = req.query;
  if (!doi || typeof doi !== 'string') {
    return res.status(400).json({ message: 'DOI is required' });
  }

  const cleanDoi = doi.trim().replace(/^https?:\/\/doi\.org\//i, '').replace(/^doi:\s*/i, '');

  try {
    const response = await fetch(`https://api.crossref.org/works/${encodeURIComponent(cleanDoi)}`, {
      headers: {
        'User-Agent': 'LabFlow Literature Manager (mailto:support@labflow.local)'
      }
    });

    if (!response.ok) {
      return res.status(404).json({ message: `DOI not found (${response.status})` });
    }

    const json = await response.json();
    const message = json.message || {};

    const title = Array.isArray(message.title) ? message.title[0] : (message.title || '');
    const authors = Array.isArray(message.author)
      ? message.author.map((a: any) => `${a.given ? a.given + ' ' : ''}${a.family || a.name || ''}`).join(', ')
      : '';
    const journal = Array.isArray(message['container-title'])
      ? message['container-title'][0]
      : (message['container-title'] || '');
    const volume = message.volume || '';
    const issue = message.issue || '';
    const pages = message.page || '';
    const year = message.published?.['date-parts']?.[0]?.[0] || message['published-print']?.['date-parts']?.[0]?.[0] || message['published-online']?.['date-parts']?.[0]?.[0] || null;
    
    // Abstract sometimes comes in JATS XML format
    let abstract = message.abstract || '';
    abstract = abstract.replace(/<[^>]*>/g, '').trim();

    // Lab / Affiliation of first or last author
    let lab_name = '';
    if (Array.isArray(message.author) && message.author.length > 0) {
      const affiliations = message.author[0]?.affiliation;
      if (Array.isArray(affiliations) && affiliations.length > 0) {
        lab_name = affiliations[0]?.name || '';
      }
    }

    let paper_type = 'original';
    const type = message.type || '';
    if (type.includes('review') || type.includes('book')) paper_type = mapPaperType(type);

    res.json({
      doi: cleanDoi,
      title,
      authors,
      journal,
      volume,
      issue,
      pages,
      year,
      abstract,
      lab_name,
      paper_type
    });
  } catch (error: any) {
    console.error('DOI lookup error:', error);
    res.status(500).json({ message: 'DOI lookup failed: ' + error.message });
  }
});

// ─── GET /api/literature/:id ───
router.get('/:id', (req, res) => {
  const userId = req.userId;
  const item = db.prepare(`SELECT * FROM literature WHERE id = ? AND user_id = ?`).get(req.params.id, userId) as any;
  if (!item) return res.status(404).json({ message: 'Not found' });

  res.json({
    ...item,
    read_abstract: Boolean(item.read_abstract),
    read_body: Boolean(item.read_body),
    keywords: parseKeywords(item.keywords)
  });
});

// ─── POST /api/literature ───
router.post('/', (req, res) => {
  const userId = req.userId;
  const {
    title,
    authors = '',
    lab_name = '',
    journal = '',
    volume = '',
    issue = '',
    pages = '',
    year = null,
    doi = '',
    paper_type = 'original',
    project_name = '',
    abstract = '',
    notes = '',
    keywords = [],
    read_abstract = 0,
    read_body = 0
  } = req.body;

  if (!title || !title.trim()) {
    return res.status(400).json({ message: 'Title is required' });
  }

  try {
    const result = db.prepare(`
      INSERT INTO literature (
        user_id, title, authors, lab_name, journal, volume, issue, pages, year, doi,
        paper_type, project_name, abstract, notes, keywords, read_abstract, read_body
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      userId,
      title.trim(),
      authors,
      lab_name,
      journal,
      volume,
      issue,
      pages,
      year ? Number(year) : null,
      doi.trim(),
      paper_type || 'original',
      project_name.trim(),
      abstract,
      notes,
      JSON.stringify(Array.isArray(keywords) ? keywords : parseKeywords(keywords)),
      read_abstract ? 1 : 0,
      read_body ? 1 : 0
    );

    const inserted = db.prepare(`SELECT * FROM literature WHERE id = ?`).get(result.lastInsertRowid) as any;
    res.status(201).json({
      ...inserted,
      read_abstract: Boolean(inserted.read_abstract),
      read_body: Boolean(inserted.read_body),
      keywords: parseKeywords(inserted.keywords)
    });
  } catch (error) {
    console.error('Error creating literature:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// ─── PUT /api/literature/:id ───
router.put('/:id', (req, res) => {
  const userId = req.userId;
  const { id } = req.params;
  const {
    title,
    authors = '',
    lab_name = '',
    journal = '',
    volume = '',
    issue = '',
    pages = '',
    year = null,
    doi = '',
    paper_type = 'original',
    project_name = '',
    abstract = '',
    notes = '',
    keywords = [],
    read_abstract,
    read_body
  } = req.body;

  if (!title || !title.trim()) {
    return res.status(400).json({ message: 'Title is required' });
  }

  const existing = db.prepare(`SELECT * FROM literature WHERE id = ? AND user_id = ?`).get(id, userId) as any;
  if (!existing) return res.status(404).json({ message: 'Not found' });

  try {
    db.prepare(`
      UPDATE literature SET
        title = ?,
        authors = ?,
        lab_name = ?,
        journal = ?,
        volume = ?,
        issue = ?,
        pages = ?,
        year = ?,
        doi = ?,
        paper_type = ?,
        project_name = ?,
        abstract = ?,
        notes = ?,
        keywords = ?,
        read_abstract = ?,
        read_body = ?,
        updated_at = datetime('now', 'localtime')
      WHERE id = ? AND user_id = ?
    `).run(
      title.trim(),
      authors,
      lab_name,
      journal,
      volume,
      issue,
      pages,
      year ? Number(year) : null,
      doi.trim(),
      paper_type || 'original',
      project_name.trim(),
      abstract,
      notes,
      JSON.stringify(Array.isArray(keywords) ? keywords : parseKeywords(keywords)),
      read_abstract !== undefined ? (read_abstract ? 1 : 0) : existing.read_abstract,
      read_body !== undefined ? (read_body ? 1 : 0) : existing.read_body,
      id,
      userId
    );

    const updated = db.prepare(`SELECT * FROM literature WHERE id = ?`).get(id) as any;
    res.json({
      ...updated,
      read_abstract: Boolean(updated.read_abstract),
      read_body: Boolean(updated.read_body),
      keywords: parseKeywords(updated.keywords)
    });
  } catch (error) {
    console.error('Error updating literature:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// ─── PUT /api/literature/:id/status ───
router.put('/:id/status', (req, res) => {
  const userId = req.userId;
  const { id } = req.params;
  const { read_abstract, read_body } = req.body;

  const existing = db.prepare(`SELECT * FROM literature WHERE id = ? AND user_id = ?`).get(id, userId) as any;
  if (!existing) return res.status(404).json({ message: 'Not found' });

  const newAbstract = read_abstract !== undefined ? (read_abstract ? 1 : 0) : existing.read_abstract;
  const newBody = read_body !== undefined ? (read_body ? 1 : 0) : existing.read_body;

  db.prepare(`
    UPDATE literature SET
      read_abstract = ?,
      read_body = ?,
      updated_at = datetime('now', 'localtime')
    WHERE id = ? AND user_id = ?
  `).run(newAbstract, newBody, id, userId);

  res.json({ id: Number(id), read_abstract: Boolean(newAbstract), read_body: Boolean(newBody) });
});

// ─── DELETE /api/literature/:id ───
router.delete('/:id', (req, res) => {
  const userId = req.userId;
  const { id } = req.params;

  const existing = db.prepare(`SELECT * FROM literature WHERE id = ? AND user_id = ?`).get(id, userId) as any;
  if (!existing) return res.status(404).json({ message: 'Not found' });

  // Delete attached files if present
  if (existing.pdf_path) {
    const filePath = path.join(LIT_DIR, existing.pdf_path);
    if (fs.existsSync(filePath)) {
      try { fs.unlinkSync(filePath); } catch {}
    }
  }
  if (existing.supplemental_path) {
    const filePath = path.join(LIT_DIR, existing.supplemental_path);
    if (fs.existsSync(filePath)) {
      try { fs.unlinkSync(filePath); } catch {}
    }
  }

  db.prepare(`DELETE FROM literature WHERE id = ? AND user_id = ?`).run(id, userId);
  res.json({ success: true, id: Number(id) });
});

// ─── POST /api/literature/:id/upload ───
router.post('/:id/upload', upload.fields([
  { name: 'pdf', maxCount: 1 },
  { name: 'supplemental', maxCount: 1 }
]), (req, res) => {
  const userId = req.userId;
  const { id } = req.params;

  const existing = db.prepare(`SELECT * FROM literature WHERE id = ? AND user_id = ?`).get(id, userId) as any;
  if (!existing) return res.status(404).json({ message: 'Not found' });

  const files = req.files as { [fieldname: string]: Express.Multer.File[] };

  let pdf_filename = existing.pdf_filename;
  let pdf_path = existing.pdf_path;
  let supplemental_filename = existing.supplemental_filename;
  let supplemental_path = existing.supplemental_path;

  if (files?.pdf?.[0]) {
    // Delete old file if exists
    if (existing.pdf_path) {
      const old = path.join(LIT_DIR, existing.pdf_path);
      if (fs.existsSync(old)) try { fs.unlinkSync(old); } catch {}
    }
    pdf_filename = files.pdf[0].originalname;
    pdf_path = files.pdf[0].filename;
  }

  if (files?.supplemental?.[0]) {
    // Delete old file if exists
    if (existing.supplemental_path) {
      const old = path.join(LIT_DIR, existing.supplemental_path);
      if (fs.existsSync(old)) try { fs.unlinkSync(old); } catch {}
    }
    supplemental_filename = files.supplemental[0].originalname;
    supplemental_path = files.supplemental[0].filename;
  }

  db.prepare(`
    UPDATE literature SET
      pdf_filename = ?,
      pdf_path = ?,
      supplemental_filename = ?,
      supplemental_path = ?,
      updated_at = datetime('now', 'localtime')
    WHERE id = ? AND user_id = ?
  `).run(pdf_filename, pdf_path, supplemental_filename, supplemental_path, id, userId);

  const updated = db.prepare(`SELECT * FROM literature WHERE id = ?`).get(id) as any;
  res.json({
    ...updated,
    read_abstract: Boolean(updated.read_abstract),
    read_body: Boolean(updated.read_body),
    keywords: parseKeywords(updated.keywords)
  });
});

// ─── DELETE /api/literature/:id/files/:fileType ───
router.delete('/:id/files/:fileType', (req, res) => {
  const userId = req.userId;
  const { id, fileType } = req.params;

  const existing = db.prepare(`SELECT * FROM literature WHERE id = ? AND user_id = ?`).get(id, userId) as any;
  if (!existing) return res.status(404).json({ message: 'Not found' });

  if (fileType === 'pdf') {
    if (existing.pdf_path) {
      const full = path.join(LIT_DIR, existing.pdf_path);
      if (fs.existsSync(full)) try { fs.unlinkSync(full); } catch {}
    }
    db.prepare(`UPDATE literature SET pdf_filename = '', pdf_path = '', updated_at = datetime('now', 'localtime') WHERE id = ?`).run(id);
  } else if (fileType === 'supplemental') {
    if (existing.supplemental_path) {
      const full = path.join(LIT_DIR, existing.supplemental_path);
      if (fs.existsSync(full)) try { fs.unlinkSync(full); } catch {}
    }
    db.prepare(`UPDATE literature SET supplemental_filename = '', supplemental_path = '', updated_at = datetime('now', 'localtime') WHERE id = ?`).run(id);
  }

  const updated = db.prepare(`SELECT * FROM literature WHERE id = ?`).get(id) as any;
  res.json({
    ...updated,
    read_abstract: Boolean(updated.read_abstract),
    read_body: Boolean(updated.read_body),
    keywords: parseKeywords(updated.keywords)
  });
});

// ─── GET /api/literature/files/:filename ───
router.get('/files/:filename', (req, res) => {
  const { filename } = req.params;
  const safeName = path.basename(filename);
  const fullPath = path.join(LIT_DIR, safeName);

  if (!fs.existsSync(fullPath)) {
    return res.status(404).json({ message: 'File not found' });
  }

  const ext = path.extname(safeName).toLowerCase();
  const mimeTypes: { [key: string]: string } = {
    '.pdf': 'application/pdf',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.webp': 'image/webp',
    '.gif': 'image/gif',
    '.zip': 'application/zip',
    '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    '.csv': 'text/csv',
    '.txt': 'text/plain'
  };

  const contentType = mimeTypes[ext] || 'application/octet-stream';
  res.setHeader('Content-Type', contentType);
  res.setHeader('Content-Disposition', `inline; filename="${safeName}"`);

  const stream = fs.createReadStream(fullPath);
  stream.pipe(res);
});

// ─── PARSERS for Zotero Import ───

// 1. Robust Brace-Aware BibTeX Parser
function parseBibTeX(text: string): any[] {
  const entries: any[] = [];
  let i = 0;
  const len = text.length;

  while (i < len) {
    const atPos = text.indexOf('@', i);
    if (atPos === -1) break;
    i = atPos + 1;

    // Read entry type
    const typeStart = i;
    while (i < len && /[a-zA-Z0-9_-]/.test(text[i])) {
      i++;
    }
    const entryType = text.slice(typeStart, i).trim();
    if (!entryType || ['comment', 'preamble', 'string'].includes(entryType.toLowerCase())) {
      continue;
    }

    // Skip whitespace until '{' or '('
    while (i < len && text[i] !== '{' && text[i] !== '(') {
      i++;
    }
    if (i >= len) break;
    const openChar = text[i];
    const closeChar = openChar === '{' ? '}' : ')';
    i++; // Skip openChar

    // Skip whitespace, read citation key until ','
    while (i < len && /\s/.test(text[i])) i++;
    const keyStart = i;
    while (i < len && text[i] !== ',' && text[i] !== closeChar) {
      i++;
    }
    if (i < len && text[i] === ',') i++; // Skip ','

    // Parse fields
    const fields: Record<string, string> = {};
    let braceDepth = 1;

    while (i < len && braceDepth > 0) {
      // Skip whitespace and commas
      while (i < len && /[\s,]/.test(text[i])) {
        i++;
      }
      if (i >= len) break;
      if (text[i] === closeChar) {
        braceDepth--;
        i++;
        break;
      }

      // Read field name
      const nameStart = i;
      while (i < len && /[a-zA-Z0-9_:-]/.test(text[i])) {
        i++;
      }
      const fieldName = text.slice(nameStart, i).trim().toLowerCase();

      // Skip whitespace to '='
      while (i < len && text[i] !== '=' && text[i] !== closeChar) {
        i++;
      }
      if (i >= len || text[i] === closeChar) {
        if (text[i] === closeChar) braceDepth--;
        break;
      }
      i++; // Skip '='

      // Skip whitespace to value start
      while (i < len && /\s/.test(text[i])) {
        i++;
      }
      if (i >= len) break;

      // Read field value
      let fieldValue = '';
      if (text[i] === '{') {
        i++; // skip open {
        let valueBraceDepth = 1;
        const valStart = i;
        while (i < len && valueBraceDepth > 0) {
          if (text[i] === '\\') {
            i += 2;
            continue;
          }
          if (text[i] === '{') valueBraceDepth++;
          else if (text[i] === '}') valueBraceDepth--;
          if (valueBraceDepth > 0) i++;
        }
        fieldValue = text.slice(valStart, i);
        if (i < len && text[i] === '}') i++;
      } else if (text[i] === '"') {
        i++; // skip open "
        const valStart = i;
        while (i < len && text[i] !== '"') {
          if (text[i] === '\\') {
            i += 2;
            continue;
          }
          i++;
        }
        fieldValue = text.slice(valStart, i);
        if (i < len && text[i] === '"') i++;
      } else {
        const valStart = i;
        while (i < len && text[i] !== ',' && text[i] !== closeChar && text[i] !== '\n' && text[i] !== '\r') {
          i++;
        }
        fieldValue = text.slice(valStart, i).trim();
      }

      if (fieldName) {
        // Clean inner LaTeX braces
        const cleanVal = fieldValue.replace(/[{}]/g, '').replace(/\s+/g, ' ').trim();
        fields[fieldName] = cleanVal;
      }

      // Skip until comma or close
      while (i < len && text[i] !== ',' && text[i] !== closeChar) {
        if (text[i] === '{') {
          let subDepth = 1;
          i++;
          while (i < len && subDepth > 0) {
            if (text[i] === '{') subDepth++;
            else if (text[i] === '}') subDepth--;
            i++;
          }
        } else {
          i++;
        }
      }
      if (i < len && text[i] === ',') {
        i++;
      } else if (i < len && text[i] === closeChar) {
        braceDepth--;
        i++;
        break;
      }
    }

    const title = fields.title || fields.chapter || '';
    if (!title) continue;

    let authors = fields.author || fields.editor || '';
    if (authors) {
      authors = authors.split(/\s+and\s+/i).map(a => {
        if (a.includes(',')) {
          const [last, first] = a.split(',').map(s => s.trim());
          return `${first || ''} ${last || ''}`.trim();
        }
        return a.trim();
      }).filter(Boolean).join(', ');
    }

    const journal = fields.journal || fields.journaltitle || fields.booktitle || fields.publisher || '';
    const volume = fields.volume || '';
    const issue = fields.number || fields.issue || '';
    const pages = fields.pages ? fields.pages.replace(/--/g, '-') : '';
    const yearMatch = (fields.year || fields.date || '').match(/([0-9]{4})/);
    const year = yearMatch ? parseInt(yearMatch[1], 10) : null;
    const doi = (fields.doi || '').replace(/^https?:\/\/doi\.org\//i, '').replace(/^doi:\s*/i, '');
    const abstract = fields.abstract || '';
    const notes = fields.note || fields.annote || fields.comment || '';
    const keywords = (fields.keywords || fields.keyword || '')
      .split(/[,;]/)
      .map(k => k.trim())
      .filter(Boolean);

    entries.push({
      title,
      authors,
      journal,
      volume,
      issue,
      pages,
      year,
      doi,
      abstract,
      notes,
      keywords,
      paper_type: mapPaperType(entryType)
    });
  }

  return entries;
}

// 2. RIS Parser
function parseRIS(text: string): any[] {
  const entries: any[] = [];
  const lines = text.split(/\r?\n/);

  let current: any = null;

  for (const line of lines) {
    const match = line.match(/^([A-Z0-9]{2})\s*-\s*(.*)$/);
    if (!match) continue;

    const tag = match[1];
    const val = match[2].trim();

    if (tag === 'TY') {
      if (current && current.title) entries.push(current);
      current = {
        title: '',
        authors: [] as string[],
        journal: '',
        volume: '',
        issue: '',
        pages: '',
        sp: '',
        ep: '',
        year: null,
        doi: '',
        abstract: '',
        notes: '',
        keywords: [] as string[],
        paper_type: mapPaperType(val)
      };
      continue;
    }

    if (!current) continue;

    switch (tag) {
      case 'TI':
      case 'T1':
      case 'CT':
        current.title = val;
        break;
      case 'AU':
      case 'A1':
      case 'A2':
      case 'ED':
        current.authors.push(val);
        break;
      case 'JF':
      case 'JO':
      case 'JA':
      case 'J2':
      case 'T2':
      case 'BT':
        if (!current.journal) current.journal = val;
        break;
      case 'VL':
        current.volume = val;
        break;
      case 'IS':
      case 'CP':
        current.issue = val;
        break;
      case 'SP':
        current.sp = val;
        break;
      case 'EP':
        current.ep = val;
        break;
      case 'PY':
      case 'Y1':
      case 'DA':
        const yMatch = val.match(/([0-9]{4})/);
        if (yMatch && !current.year) current.year = parseInt(yMatch[1], 10);
        break;
      case 'DO':
        current.doi = val.replace(/^https?:\/\/doi\.org\//i, '').replace(/^doi:\s*/i, '');
        break;
      case 'AB':
      case 'N2':
        current.abstract = (current.abstract ? current.abstract + '\n' : '') + val;
        break;
      case 'N1':
      case 'RN':
        current.notes = (current.notes ? current.notes + '\n' : '') + val;
        break;
      case 'KW':
        current.keywords.push(val);
        break;
      case 'ER':
        if (current.title) {
          if (current.sp && current.ep) {
            current.pages = `${current.sp}-${current.ep}`;
          } else if (current.sp) {
            current.pages = current.sp;
          }
          current.authors = current.authors.map((a: string) => {
            if (a.includes(',')) {
              const [last, first] = a.split(',').map(s => s.trim());
              return `${first || ''} ${last || ''}`.trim();
            }
            return a;
          }).filter(Boolean).join(', ');
          entries.push(current);
        }
        current = null;
        break;
    }
  }

  if (current && current.title) {
    if (current.sp && current.ep) current.pages = `${current.sp}-${current.ep}`;
    current.authors = current.authors.join(', ');
    entries.push(current);
  }

  return entries;
}

// 3. CSL-JSON Parser
function parseCSLJSON(text: string): any[] {
  let data: any;
  try {
    data = JSON.parse(text);
  } catch {
    return [];
  }

  const items = Array.isArray(data) ? data : (data.items && Array.isArray(data.items) ? data.items : [data]);
  const entries: any[] = [];

  for (const item of items) {
    const title = item.title || '';
    if (!title) continue;

    let authors = '';
    if (Array.isArray(item.author)) {
      authors = item.author.map((a: any) => `${a.given ? a.given + ' ' : ''}${a.family || a.name || ''}`).filter(Boolean).join(', ');
    }

    const journal = item['container-title'] || item['collection-title'] || item.publisher || '';
    const volume = item.volume || '';
    const issue = item.issue || item.number || '';
    const pages = item.page || '';
    let year: number | null = null;

    if (item.issued?.['date-parts']?.[0]?.[0]) {
      year = parseInt(item.issued['date-parts'][0][0], 10);
    } else if (item.issued?.raw) {
      const ym = String(item.issued.raw).match(/([0-9]{4})/);
      if (ym) year = parseInt(ym[1], 10);
    }

    const doi = (item.DOI || item.doi || '').replace(/^https?:\/\/doi\.org\//i, '').replace(/^doi:\s*/i, '');
    const abstract = item.abstract || '';
    const notes = item.note || '';
    const keywords = Array.isArray(item.keyword)
      ? item.keyword
      : (typeof item.keyword === 'string' ? item.keyword.split(/[,;]/).map((s: string) => s.trim()).filter(Boolean) : []);

    entries.push({
      title,
      authors,
      journal,
      volume,
      issue,
      pages,
      year: isNaN(year as number) ? null : year,
      doi,
      abstract,
      notes,
      keywords,
      paper_type: mapPaperType(item.type || '')
    });
  }

  return entries;
}

// ─── POST /api/literature/import-zotero ───
router.post('/import-zotero', (req, res) => {
  const userId = req.userId;
  const { content, format, project_name = '', default_paper_type } = req.body;

  if (!content || typeof content !== 'string') {
    return res.status(400).json({ message: 'インポートするテキストが指定されていません。' });
  }

  const trimmed = content.trim();
  let items: any[] = [];

  try {
    if (format === 'bibtex' || trimmed.startsWith('@') || trimmed.includes('@article') || trimmed.includes('@book') || trimmed.includes('@inproceedings') || trimmed.includes('@misc')) {
      items = parseBibTeX(trimmed);
    } else if (format === 'ris' || trimmed.startsWith('TY  -') || trimmed.includes('\nTY  -')) {
      items = parseRIS(trimmed);
    } else if (format === 'csl-json' || trimmed.startsWith('[') || trimmed.startsWith('{')) {
      items = parseCSLJSON(trimmed);
    } else {
      // Auto-detect fallback
      if (trimmed.includes('@')) items = parseBibTeX(trimmed);
      else if (trimmed.includes('TY  -')) items = parseRIS(trimmed);
      else items = parseCSLJSON(trimmed);
    }
  } catch (parseErr: any) {
    console.error('Parse error during literature import:', parseErr);
    return res.status(400).json({ message: 'ファイルの解析中にエラーが発生しました: ' + parseErr.message });
  }

  if (items.length === 0) {
    return res.status(400).json({
      message: '有効な文献レコードが見つかりませんでした。BibTeX (@article{...})、RIS (TY  - JOUR...)、または CSL-JSON 形式であることを確認してください。'
    });
  }

  const insertStmt = db.prepare(`
    INSERT INTO literature (
      user_id, title, authors, lab_name, journal, volume, issue, pages, year, doi,
      paper_type, project_name, abstract, notes, keywords, read_abstract, read_body
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 0)
  `);

  const insertedIds: number[] = [];

  try {
    const insertTx = db.transaction(() => {
      for (const item of items) {
        const type = default_paper_type || item.paper_type || 'original';
        const proj = project_name || '';
        const result = insertStmt.run(
          userId,
          item.title.trim(),
          item.authors || '',
          item.lab_name || '',
          item.journal || '',
          item.volume || '',
          item.issue || '',
          item.pages || '',
          item.year ? Number(item.year) : null,
          (item.doi || '').trim(),
          type,
          proj.trim(),
          item.abstract || '',
          item.notes || '',
          JSON.stringify(Array.isArray(item.keywords) ? item.keywords : [])
        );
        insertedIds.push(Number(result.lastInsertRowid));
      }
    });

    insertTx();
    res.json({
      success: true,
      imported_count: insertedIds.length,
      inserted_ids: insertedIds
    });
  } catch (dbError: any) {
    console.error('DB Error importing Zotero items:', dbError);
    res.status(500).json({ message: 'データベースへの保存に失敗しました: ' + dbError.message });
  }
});

export default router;

