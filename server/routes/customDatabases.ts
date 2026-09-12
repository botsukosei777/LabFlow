import { Router } from 'express';
import db from '../db/database.js';

const router = Router();

// ─── Default Templates ───
export const PRESET_TEMPLATES = [
  {
    id: 'primers',
    name: 'プライマー/核酸オリゴ管理',
    description: 'PCR・qPCR・シーケンス・FISHプローブ等のプライマーおよび核酸オリゴの配列・Tm値・発注状況・機能確認を管理します',
    category: 'oligo',
    columns: [
      { key: 'primer_code', name: 'プライマーコードID', type: 'text', required: true, hint: 'アルファベット・数字（例: P-001, Fwd_Actin1）' },
      { key: 'oligo_type', name: '種別', type: 'select', required: true, options: ['PCRプライマー', 'qPCRプライマー', 'シーケンス用', 'FISH用オリゴ', 'クローニング用', 'その他'] },
      { key: 'sequence', name: '配列 (5\'→3\')', type: 'sequence', required: true, hint: '塩基長・Tm値が自動計算されます' },
      { key: 'length', name: '配列長 (bp)', type: 'number', computed: true },
      { key: 'tm', name: 'Tm値 (℃)', type: 'number', computed: true },
      { key: 'order_status', name: '発注日/発注の有無', type: 'select', options: ['未発注', '発注済 (納期確認中)', '納品済 (使用可能)', '在庫切れ/再発注必要'] },
      { key: 'order_date', name: '発注日', type: 'date' },
      { key: 'projects', name: 'プロジェクト名', type: 'tags', hint: '使いまわし可能なタグ' },
      { key: 'pair_primer', name: 'ペアとなるプライマー番号', type: 'text', hint: 'Revプライマー等' },
      { key: 'worked', name: 'workしたかどうか', type: 'select', options: ['良好 (Worked)', '微弱 (Weak)', '未確認 (Untested)', '機能せず (Failed)'] },
      { key: 'storage_location', name: '保管場所', type: 'text', hint: '-20℃冷凍庫 Box A-1 等' },
      { key: 'notes', name: '備考/用途', type: 'textarea' },
    ]
  },
  {
    id: 'transformants',
    name: '形質転換体等の管理',
    description: '植物・動物・微生物などの形質転換体、系統、導入遺伝子、世代数、子孫数、ジェノタイピング状況を管理します',
    category: 'sample',
    columns: [
      { key: 'individual_id', name: '個体識別ID', type: 'text', required: true, hint: '例: TF-2026-001' },
      { key: 'background_strain', name: 'バックグラウンド系統/品種', type: 'text', required: true, hint: '例: Col-0, C57BL/6, DH5α, BY-2' },
      { key: 'transgenes', name: '形質転換した遺伝子等の名', type: 'tags', required: true, hint: 'プロモーター・導入遺伝子タグ' },
      { key: 'genotyped', name: 'ジェノタイピング実施', type: 'checkbox' },
      { key: 'generation', name: '現世代数', type: 'text', hint: '例: T0, T4, M2, G3, F1 など' },
      { key: 'progeny_count', name: '子孫の数', type: 'number' },
      { key: 'selection_marker', name: '選抜マーカー/耐性', type: 'text', hint: 'Kanamycin, Hygromycin, GFP等' },
      { key: 'storage_location', name: '保管場所/インキュベーター', type: 'text' },
      { key: 'notes', name: '表現型/備考', type: 'textarea' },
    ]
  },
  {
    id: 'antibodies',
    name: '抗体の管理',
    description: '一次抗体・二次抗体の宿主動物、抗原、希釈倍率、使用実績、標識物質、対応アプリケーションを管理します',
    category: 'antibody',
    columns: [
      { key: 'antibody_id', name: '抗体のID', type: 'text', required: true, hint: '例: Ab-042, anti-GFP' },
      { key: 'ab_type', name: '一次/二次抗体の種別', type: 'select', required: true, options: ['一次抗体 (Primary)', '二次抗体 (Secondary)'] },
      { key: 'host_animal', name: '免疫動物', type: 'select', options: ['Rabbit (ウサギ)', 'Mouse (マウス)', 'Goat (ヤギ)', 'Rat (ラット)', 'Guinea Pig (モルモット)', 'Chicken (ニワトリ)', 'Donkey (ロバ)', 'その他'] },
      { key: 'antigen', name: '抗原名またはペプチド配列', type: 'text', required: true },
      { key: 'worked', name: 'workしたかどうか', type: 'select', options: ['良好 (Worked)', '微弱 (Weak)', '未確認 (Untested)', '機能せず (Failed)'] },
      { key: 'conjugate', name: '付加した物質 (標識)', type: 'text', hint: 'HRP, Alexa Fluor 488, FITC, Biotin, なし 等' },
      { key: 'applications', name: '使用用途', type: 'tags', hint: 'WB, IHC, IF, IP, ELISA, ChIP, Flow Cytometry' },
      { key: 'clonality', name: 'モノクローナル/ポリクローナル', type: 'select', options: ['Monoclonal', 'Polyclonal', 'Recombinant'] },
      { key: 'storage_location', name: '保管場所', type: 'text', hint: '-20℃ Box B-3 等' },
      { key: 'notes', name: '希釈倍率/備考', type: 'textarea' },
    ]
  }
];

// GET /api/custom-databases/templates
router.get('/templates', (_req, res) => {
  res.json(PRESET_TEMPLATES);
});

// GET /api/custom-databases - List all databases for current user
router.get('/', (req, res) => {
  const userId = req.userId;
  try {
    const databases = db.prepare(`
      SELECT cd.*, 
        (SELECT COUNT(*) FROM custom_database_items cdi WHERE cdi.database_id = cd.id) as item_count
      FROM custom_databases cd
      WHERE cd.user_id = ?
      ORDER BY cd.created_at ASC
    `).all(userId) as any[];

    const formatted = databases.map(d => ({
      ...d,
      columns: JSON.parse(d.columns_json || '[]')
    }));

    res.json(formatted);
  } catch (error: any) {
    console.error('Failed to fetch custom databases:', error);
    res.status(500).json({ error: error.message });
  }
});

// POST /api/custom-databases - Create a new database
router.post('/', (req, res) => {
  const userId = req.userId;
  const { name, description = '', category = 'general', columns = [] } = req.body;

  if (!name || typeof name !== 'string') {
    return res.status(400).json({ error: 'データベース名を入力してください' });
  }

  try {
    const columnsJson = JSON.stringify(columns);
    const result = db.prepare(`
      INSERT INTO custom_databases (user_id, name, description, category, columns_json)
      VALUES (?, ?, ?, ?, ?)
    `).run(userId, name.trim(), description.trim(), category, columnsJson);

    const created = db.prepare(`
      SELECT * FROM custom_databases WHERE id = ?
    `).get(result.lastInsertRowid) as any;

    res.status(201).json({
      ...created,
      columns: JSON.parse(created.columns_json || '[]'),
      item_count: 0
    });
  } catch (error: any) {
    console.error('Failed to create custom database:', error);
    res.status(500).json({ error: error.message });
  }
});

// PUT /api/custom-databases/:id - Update database definition
router.put('/:id', (req, res) => {
  const userId = req.userId;
  const { id } = req.params;
  const { name, description, category, columns } = req.body;

  try {
    const existing = db.prepare(`
      SELECT id FROM custom_databases WHERE id = ? AND user_id = ?
    `).get(id, userId);

    if (!existing) {
      return res.status(404).json({ error: '指定されたデータベースが見つかりません' });
    }

    const updates: string[] = ['updated_at = datetime(\'now\', \'localtime\')'];
    const params: any[] = [];

    if (name !== undefined) {
      updates.push('name = ?');
      params.push(name.trim());
    }
    if (description !== undefined) {
      updates.push('description = ?');
      params.push(description.trim());
    }
    if (category !== undefined) {
      updates.push('category = ?');
      params.push(category);
    }
    if (columns !== undefined) {
      updates.push('columns_json = ?');
      params.push(JSON.stringify(columns));
    }

    params.push(id, userId);
    db.prepare(`
      UPDATE custom_databases SET ${updates.join(', ')} WHERE id = ? AND user_id = ?
    `).run(...params);

    const updated = db.prepare(`
      SELECT cd.*, 
        (SELECT COUNT(*) FROM custom_database_items cdi WHERE cdi.database_id = cd.id) as item_count
      FROM custom_databases cd
      WHERE cd.id = ?
    `).get(id) as any;

    res.json({
      ...updated,
      columns: JSON.parse(updated.columns_json || '[]')
    });
  } catch (error: any) {
    console.error('Failed to update custom database:', error);
    res.status(500).json({ error: error.message });
  }
});

// DELETE /api/custom-databases/:id - Delete database
router.delete('/:id', (req, res) => {
  const userId = req.userId;
  const { id } = req.params;

  try {
    const result = db.prepare(`
      DELETE FROM custom_databases WHERE id = ? AND user_id = ?
    `).run(id, userId);

    if (result.changes === 0) {
      return res.status(404).json({ error: '指定されたデータベースが見つかりません' });
    }

    res.json({ success: true, message: 'データベースを削除しました' });
  } catch (error: any) {
    console.error('Failed to delete custom database:', error);
    res.status(500).json({ error: error.message });
  }
});

// ─── Items within a Database ───

// GET /api/custom-databases/:id/items - List all items
router.get('/:id/items', (req, res) => {
  const userId = req.userId;
  const { id } = req.params;

  try {
    // Verify database ownership
    const dbCheck = db.prepare(`
      SELECT id FROM custom_databases WHERE id = ? AND user_id = ?
    `).get(id, userId);

    if (!dbCheck) {
      return res.status(404).json({ error: 'データベースが見つかりません' });
    }

    const rows = db.prepare(`
      SELECT * FROM custom_database_items
      WHERE database_id = ? AND user_id = ?
      ORDER BY id DESC
    `).all(id, userId) as any[];

    const items = rows.map(r => ({
      id: r.id,
      database_id: r.database_id,
      data: JSON.parse(r.data_json || '{}'),
      created_at: r.created_at,
      updated_at: r.updated_at
    }));

    res.json(items);
  } catch (error: any) {
    console.error('Failed to fetch database items:', error);
    res.status(500).json({ error: error.message });
  }
});

// POST /api/custom-databases/:id/items - Add a new item
router.post('/:id/items', (req, res) => {
  const userId = req.userId;
  const { id } = req.params;
  const { data } = req.body;

  if (!data || typeof data !== 'object') {
    return res.status(400).json({ error: 'アイテムデータを指定してください' });
  }

  try {
    const dbCheck = db.prepare(`
      SELECT id FROM custom_databases WHERE id = ? AND user_id = ?
    `).get(id, userId);

    if (!dbCheck) {
      return res.status(404).json({ error: 'データベースが見つかりません' });
    }

    const dataJson = JSON.stringify(data);
    const result = db.prepare(`
      INSERT INTO custom_database_items (database_id, user_id, data_json)
      VALUES (?, ?, ?)
    `).run(id, userId, dataJson);

    const created = db.prepare(`
      SELECT * FROM custom_database_items WHERE id = ?
    `).get(result.lastInsertRowid) as any;

    res.status(201).json({
      id: created.id,
      database_id: created.database_id,
      data: JSON.parse(created.data_json || '{}'),
      created_at: created.created_at,
      updated_at: created.updated_at
    });
  } catch (error: any) {
    console.error('Failed to add database item:', error);
    res.status(500).json({ error: error.message });
  }
});

// PUT /api/custom-databases/:id/items/:itemId - Update an item
router.put('/:id/items/:itemId', (req, res) => {
  const userId = req.userId;
  const { id, itemId } = req.params;
  const { data } = req.body;

  if (!data || typeof data !== 'object') {
    return res.status(400).json({ error: 'アイテムデータを指定してください' });
  }

  try {
    const result = db.prepare(`
      UPDATE custom_database_items 
      SET data_json = ?, updated_at = datetime('now', 'localtime')
      WHERE id = ? AND database_id = ? AND user_id = ?
    `).run(JSON.stringify(data), itemId, id, userId);

    if (result.changes === 0) {
      return res.status(404).json({ error: 'アイテムが見つかりません' });
    }

    const updated = db.prepare(`
      SELECT * FROM custom_database_items WHERE id = ?
    `).get(itemId) as any;

    res.json({
      id: updated.id,
      database_id: updated.database_id,
      data: JSON.parse(updated.data_json || '{}'),
      created_at: updated.created_at,
      updated_at: updated.updated_at
    });
  } catch (error: any) {
    console.error('Failed to update database item:', error);
    res.status(500).json({ error: error.message });
  }
});

// DELETE /api/custom-databases/:id/items/:itemId - Delete an item
router.delete('/:id/items/:itemId', (req, res) => {
  const userId = req.userId;
  const { id, itemId } = req.params;

  try {
    const result = db.prepare(`
      DELETE FROM custom_database_items
      WHERE id = ? AND database_id = ? AND user_id = ?
    `).run(itemId, id, userId);

    if (result.changes === 0) {
      return res.status(404).json({ error: 'アイテムが見つかりません' });
    }

    res.json({ success: true, message: 'アイテムを削除しました' });
  } catch (error: any) {
    console.error('Failed to delete database item:', error);
    res.status(500).json({ error: error.message });
  }
});

export default router;
