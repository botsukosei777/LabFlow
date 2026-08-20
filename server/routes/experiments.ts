import { Router } from 'express';
import db from '../db/database.js';

const router = Router();

// ==================== EXPERIMENT TYPES ====================

// GET all experiment types with counts
router.get('/', (req, res) => {
  const experiments = db.prepare(`
    SELECT e.*,
      (SELECT COUNT(*) FROM steps WHERE experiment_type_id = e.id) as steps_count,
      (SELECT COUNT(*) FROM blocks WHERE experiment_type_id = e.id) as blocks_count,
      (SELECT COUNT(*) FROM protocols WHERE experiment_type_id = e.id) as protocols_count
    FROM experiment_types e
    WHERE e.user_id = ?
    ORDER BY e.created_at DESC
  `).all(req.userId);
  res.json(experiments);
});

// GET all protocols across all experiment types (for scheduling)
router.get('/all/protocols', (req, res) => {
  const protocols = db.prepare(`
    SELECT p.*, e.name as experiment_type_name, e.color as experiment_type_color
    FROM protocols p
    JOIN experiment_types e ON p.experiment_type_id = e.id
    WHERE p.user_id = ?
    ORDER BY e.name, p.name
  `).all(req.userId) as any[];
  
  for (const protocol of protocols) {
    protocol.blocks = db.prepare(`
      SELECT pb.*, b.name as block_name
      FROM protocol_blocks pb
      JOIN blocks b ON pb.block_id = b.id
      WHERE pb.protocol_id = ?
      ORDER BY pb.day_offset
    `).all(protocol.id);
    
    const hasSampleDep = db.prepare(`
      SELECT COUNT(*) as cnt
      FROM protocol_blocks pb
      JOIN block_steps bs ON pb.block_id = bs.block_id
      JOIN steps s ON bs.step_id = s.id
      WHERE pb.protocol_id = ? AND s.is_sample_dependent = 1
    `).get(protocol.id) as any;
    protocol.has_sample_dependent_steps = hasSampleDep.cnt > 0;
  }
  
  res.json(protocols);
});

// GET single protocol
router.get('/protocols/:protocolId', (req, res) => {
  const protocol = db.prepare(`
    SELECT p.*, e.name as experiment_type_name, e.color as experiment_type_color
    FROM protocols p
    JOIN experiment_types e ON p.experiment_type_id = e.id
    WHERE p.id = ? AND p.user_id = ?
  `).get(req.params.protocolId, req.userId) as any;
  
  if (!protocol) return res.status(404).json({ message: 'Not found' });
  
  protocol.blocks = db.prepare(`
    SELECT pb.*, b.name as block_name, b.description as block_description, b.pattern_label
    FROM protocol_blocks pb
    JOIN blocks b ON pb.block_id = b.id
    WHERE pb.protocol_id = ?
    ORDER BY pb.day_offset, pb.order_index
  `).all(protocol.id) as any[];
  
  for (const block of protocol.blocks) {
    block.steps = db.prepare(`
      SELECT bs.*, s.name as step_name, s.description as step_description, s.duration_minutes
      FROM block_steps bs
      JOIN steps s ON bs.step_id = s.id
      WHERE bs.block_id = ?
      ORDER BY bs.order_index
    `).all(block.block_id);
  }
  
  res.json(protocol);
});

router.put('/steps/:stepId', (req, res) => {
  // Check ownership
  const step = db.prepare(`
    SELECT e.user_id FROM steps s JOIN experiment_types e ON s.experiment_type_id = e.id WHERE s.id = ?
  `).get(req.params.stepId) as any;
  if (!step || step.user_id !== req.userId) return res.status(403).json({ message: 'Forbidden' });

  const { name, description, duration_minutes, extra_duration_minutes, time_per_sample_minutes, is_overnight, pattern_label, order_index, sub_protocol_id, preparations, routine_name, routine_duration_days, routine_recurrence, routine_recurrence_days } = req.body;
  db.prepare(
    'UPDATE steps SET name = ?, description = ?, duration_minutes = ?, is_sample_dependent = ?, samples_per_batch = ?, extra_duration_minutes = ?, is_overnight = ?, pattern_label = ?, order_index = ?, sub_protocol_id = ?, routine_name = ?, routine_duration_days = ?, routine_recurrence = ?, routine_recurrence_days = ? WHERE id = ?'
  ).run(name, description, duration_minutes, req.body.is_sample_dependent ? 1 : 0, req.body.samples_per_batch || 1, extra_duration_minutes || 0, is_overnight ? 1 : 0, pattern_label, order_index, sub_protocol_id || null, routine_name || null, routine_duration_days || null, routine_recurrence || null, routine_recurrence_days || null, req.params.stepId);
  
  if (preparations && Array.isArray(preparations)) {
    db.prepare('DELETE FROM step_preparations WHERE step_id = ?').run(req.params.stepId);
    const insertPrep = db.prepare('INSERT INTO step_preparations (step_id, message, timing_type, timing_step_id, timing_offset_minutes, requires_check) VALUES (?, ?, ?, ?, ?, ?)');
    for (const prep of preparations) {
      insertPrep.run(req.params.stepId, prep.message, prep.timing_type || 'before_experiment', prep.timing_step_id || null, prep.timing_offset_minutes || 0, prep.requires_check ? 1 : 0);
    }
  }
  
  const updated = db.prepare('SELECT * FROM steps WHERE id = ?').get(req.params.stepId) as any;
  updated.preparations = db.prepare('SELECT * FROM step_preparations WHERE step_id = ?').all(req.params.stepId);
  res.json(updated);
});

router.delete('/steps/:stepId', (req, res) => {
  const step = db.prepare(`
    SELECT e.user_id FROM steps s JOIN experiment_types e ON s.experiment_type_id = e.id WHERE s.id = ?
  `).get(req.params.stepId) as any;
  if (!step || step.user_id !== req.userId) return res.status(403).json({ message: 'Forbidden' });

  db.prepare('DELETE FROM steps WHERE id = ?').run(req.params.stepId);
  res.status(204).send();
});

router.post('/:experimentId/steps/import', (req, res) => {
  const { source_step_id } = req.body;
  
  // Verify ownership of the target experiment
  const targetExp = db.prepare('SELECT user_id FROM experiment_types WHERE id = ?').get(req.params.experimentId) as any;
  if (!targetExp || targetExp.user_id !== req.userId) return res.status(403).json({ message: 'Forbidden' });
  
  // Verify ownership of the source step
  const sourceStep = db.prepare(`
    SELECT s.*, e.user_id 
    FROM steps s 
    JOIN experiment_types e ON s.experiment_type_id = e.id 
    WHERE s.id = ?
  `).get(source_step_id) as any;
  
  if (!sourceStep || sourceStep.user_id !== req.userId) return res.status(403).json({ message: 'Forbidden source step' });
  
  // Copy step
  const insertStep = db.prepare(`
    INSERT INTO steps (experiment_type_id, pattern_label, name, description, duration_minutes, is_sample_dependent, samples_per_batch, extra_duration_minutes, is_overnight, order_index, sub_protocol_id)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  
  // Put it at the end of the current experiment's steps
  const maxOrder = db.prepare('SELECT MAX(order_index) as max_idx FROM steps WHERE experiment_type_id = ?').get(req.params.experimentId) as any;
  const newOrderIndex = (maxOrder?.max_idx ?? -1) + 1;
  
  const result = insertStep.run(
    req.params.experimentId,
    sourceStep.pattern_label,
    sourceStep.name + ' (コピー)',
    sourceStep.description,
    sourceStep.duration_minutes,
    sourceStep.is_sample_dependent || 0,
    sourceStep.samples_per_batch || 1,
    sourceStep.extra_duration_minutes || 0,
    sourceStep.is_overnight || 0,
    newOrderIndex,
    sourceStep.sub_protocol_id
  );
  
  const newStepId = result.lastInsertRowid;
  
  // Copy preparations
  const sourcePreps = db.prepare('SELECT * FROM step_preparations WHERE step_id = ?').all(source_step_id) as any[];
  if (sourcePreps.length > 0) {
    const insertPrep = db.prepare('INSERT INTO step_preparations (step_id, message, timing_type, timing_step_id, timing_offset_minutes, requires_check) VALUES (?, ?, ?, ?, ?, ?)');
    for (const p of sourcePreps) {
      const newTimingStepId = p.timing_type === 'after_step' ? null : p.timing_step_id;
      insertPrep.run(newStepId, p.message, p.timing_type, newTimingStepId, p.timing_offset_minutes, p.requires_check);
    }
  }
  
  const newStep = db.prepare('SELECT * FROM steps WHERE id = ?').get(newStepId) as any;
  newStep.preparations = db.prepare('SELECT * FROM step_preparations WHERE step_id = ?').all(newStepId);
  
  res.status(201).json(newStep);
});

router.put('/blocks/:blockId', (req, res) => {
  const block = db.prepare(`
    SELECT e.user_id FROM blocks b JOIN experiment_types e ON b.experiment_type_id = e.id WHERE b.id = ?
  `).get(req.params.blockId) as any;
  if (!block || block.user_id !== req.userId) return res.status(403).json({ message: 'Forbidden' });

  const { name, description, pattern_label, order_index, step_nodes } = req.body;
  db.prepare(
    'UPDATE blocks SET name = ?, description = ?, pattern_label = ?, order_index = ? WHERE id = ?'
  ).run(name, description, pattern_label, order_index, req.params.blockId);
  
  if (step_nodes && Array.isArray(step_nodes)) {
    db.prepare('DELETE FROM block_steps WHERE block_id = ?').run(req.params.blockId);
    const insertBlockStep = db.prepare(
      'INSERT INTO block_steps (block_id, step_id, order_index, branch_index, delay_minutes) VALUES (?, ?, ?, ?, ?)'
    );
    const getStep = db.prepare('SELECT is_overnight FROM steps WHERE id = ?');
    
    for (let i = 0; i < step_nodes.length; i++) {
      const stage = step_nodes[i];
      for (let j = 0; j < stage.length; j++) {
        const branch = stage[j];
        for (let k = 0; k < branch.length; k++) {
          const node = branch[k];
          const stepInfo = getStep.get(node.step_id) as any;
          // Overnight step is allowed only in the last stage
          if (stepInfo?.is_overnight === 1 && i !== step_nodes.length - 1) {
            return res.status(400).json({ message: 'オーバーナイトステップはブロックの最後にしか配置できません' });
          }
          insertBlockStep.run(req.params.blockId, node.step_id, i, j, node.delay_minutes || 0);
        }
      }
    }
  }
  
  const updated = db.prepare('SELECT * FROM blocks WHERE id = ?').get(req.params.blockId);
  res.json(updated);
});

router.delete('/blocks/:blockId', (req, res) => {
  const block = db.prepare(`
    SELECT e.user_id FROM blocks b JOIN experiment_types e ON b.experiment_type_id = e.id WHERE b.id = ?
  `).get(req.params.blockId) as any;
  if (!block || block.user_id !== req.userId) return res.status(403).json({ message: 'Forbidden' });

  db.prepare('DELETE FROM blocks WHERE id = ?').run(req.params.blockId);
  res.status(204).send();
});

router.post('/blocks/:blockId/copy', (req, res) => {
  const blockId = req.params.blockId;
  const block = db.prepare(`
    SELECT b.*, e.user_id FROM blocks b JOIN experiment_types e ON b.experiment_type_id = e.id WHERE b.id = ?
  `).get(blockId) as any;
  if (!block || block.user_id !== req.userId) return res.status(403).json({ message: 'Forbidden' });

  const newBlock = db.prepare(
    'INSERT INTO blocks (experiment_type_id, pattern_label, name, description, order_index) VALUES (?, ?, ?, ?, ?)'
  ).run(block.experiment_type_id, block.pattern_label, `${block.name} - コピー`, block.description, block.order_index);
  
  const newBlockId = newBlock.lastInsertRowid;
  
  const blockSteps = db.prepare('SELECT * FROM block_steps WHERE block_id = ?').all(blockId) as any[];
  const insertStep = db.prepare(
    'INSERT INTO block_steps (block_id, step_id, order_index, branch_index, delay_minutes) VALUES (?, ?, ?, ?, ?)'
  );
  for (const bs of blockSteps) {
    insertStep.run(newBlockId, bs.step_id, bs.order_index, bs.branch_index, bs.delay_minutes || 0);
  }
  
  const created = db.prepare('SELECT * FROM blocks WHERE id = ?').get(newBlockId);
  res.status(201).json(created);
});

router.put('/protocols/:protocolId', (req, res) => {
  const { name, description, color, blocks } = req.body;
  
  const protocol = db.prepare('SELECT user_id FROM protocols WHERE id = ?').get(req.params.protocolId) as any;
  if (!protocol || protocol.user_id !== req.userId) return res.status(403).json({ message: 'Forbidden' });

  db.prepare(
    `UPDATE protocols SET name = ?, description = ?, color = ?, updated_at = datetime('now', 'localtime') WHERE id = ? AND user_id = ?`
  ).run(name, description, color, req.params.protocolId, req.userId);
  
  if (blocks && Array.isArray(blocks)) {
    db.prepare('DELETE FROM protocol_blocks WHERE protocol_id = ?').run(req.params.protocolId);
    const insertPB = db.prepare(
      'INSERT INTO protocol_blocks (protocol_id, block_id, day_offset, order_index) VALUES (?, ?, ?, ?)'
    );
    blocks.forEach((b: { block_id: number; day_offset: number }, i: number) => {
      insertPB.run(req.params.protocolId, b.block_id, b.day_offset, i);
    });
  }
  
  const updated = db.prepare('SELECT * FROM protocols WHERE id = ?').get(req.params.protocolId);
  res.json(updated);
});

router.delete('/protocols/:protocolId', (req, res) => {
  db.prepare('DELETE FROM protocols WHERE id = ? AND user_id = ?').run(req.params.protocolId, req.userId);
  res.status(204).send();
});

router.post('/protocols/:protocolId/copy', (req, res) => {
  const protocolId = req.params.protocolId;
  const protocol = db.prepare('SELECT * FROM protocols WHERE id = ? AND user_id = ?').get(protocolId, req.userId) as any;
  if (!protocol) return res.status(403).json({ message: 'Forbidden' });

  const newProtocol = db.prepare(
    'INSERT INTO protocols (experiment_type_id, name, description, color, user_id) VALUES (?, ?, ?, ?, ?)'
  ).run(protocol.experiment_type_id, `${protocol.name} - コピー`, protocol.description, protocol.color, req.userId);
  
  const newProtocolId = newProtocol.lastInsertRowid;
  
  const protocolBlocks = db.prepare('SELECT * FROM protocol_blocks WHERE protocol_id = ?').all(protocolId) as any[];
  const insertPB = db.prepare(
    'INSERT INTO protocol_blocks (protocol_id, block_id, day_offset, order_index) VALUES (?, ?, ?, ?)'
  );
  for (const pb of protocolBlocks) {
    insertPB.run(newProtocolId, pb.block_id, pb.day_offset, pb.order_index);
  }
  
  const created = db.prepare('SELECT * FROM protocols WHERE id = ?').get(newProtocolId);
  res.status(201).json(created);
});

// GET single experiment type with all data
router.get('/:id', (req, res) => {
  const experiment = db.prepare('SELECT * FROM experiment_types WHERE id = ? AND user_id = ?').get(req.params.id, req.userId);
  if (!experiment) return res.status(404).json({ message: 'Not found' });
  res.json(experiment);
});

// POST create experiment type
router.post('/', (req, res) => {
  const { name, description, color } = req.body;
  if (!name) return res.status(400).json({ message: 'Name is required' });
  const result = db.prepare(
    'INSERT INTO experiment_types (user_id, name, description, color) VALUES (?, ?, ?, ?)'
  ).run(req.userId, name, description || '', color || '#6366F1');
  const created = db.prepare('SELECT * FROM experiment_types WHERE id = ? AND user_id = ?').get(result.lastInsertRowid, req.userId);
  res.status(201).json(created);
});

// PUT update experiment type
router.put('/:id', (req, res) => {
  const { name, description, color } = req.body;
  db.prepare(
    `UPDATE experiment_types SET name = ?, description = ?, color = ?, updated_at = datetime('now', 'localtime') WHERE id = ? AND user_id = ?`
  ).run(name, description, color, req.params.id, req.userId);
  const updated = db.prepare('SELECT * FROM experiment_types WHERE id = ? AND user_id = ?').get(req.params.id, req.userId);
  res.json(updated);
});

// DELETE experiment type
router.delete('/:id', (req, res) => {
  db.prepare('DELETE FROM experiment_types WHERE id = ? AND user_id = ?').run(req.params.id, req.userId);
  res.status(204).send();
});

// ==================== STEPS ====================

// GET steps for experiment type (grouped by pattern)
router.get('/:id/steps', (req, res) => {
  const expType = db.prepare('SELECT id FROM experiment_types WHERE id = ? AND user_id = ?').get(req.params.id, req.userId);
  if (!expType) return res.status(403).json({ message: 'Forbidden' });

  const steps = db.prepare(
    'SELECT * FROM steps WHERE experiment_type_id = ? ORDER BY pattern_label, order_index'
  ).all(req.params.id) as any[];
  
  for (const step of steps) {
    step.preparations = db.prepare('SELECT * FROM step_preparations WHERE step_id = ?').all(step.id);
  }
  
  res.json(steps);
});

// POST create step
router.post('/:id/steps', (req, res) => {
  const expType = db.prepare('SELECT id FROM experiment_types WHERE id = ? AND user_id = ?').get(req.params.id, req.userId);
  if (!expType) return res.status(403).json({ message: 'Forbidden' });

  const { name, description, duration_minutes, extra_duration_minutes, is_overnight, pattern_label, order_index, sub_protocol_id, preparations, routine_name, routine_duration_days, routine_recurrence, routine_recurrence_days } = req.body;
  if (!name) return res.status(400).json({ message: 'Name is required' });
  
  let idx = order_index;
  if (idx === undefined || idx === null) {
    const max = db.prepare(
      'SELECT COALESCE(MAX(order_index), -1) as max_idx FROM steps WHERE experiment_type_id = ? AND pattern_label = ?'
    ).get(req.params.id, pattern_label || 'default') as any;
    idx = (max?.max_idx ?? -1) + 1;
  }

  const result = db.prepare(
    'INSERT INTO steps (experiment_type_id, name, description, duration_minutes, time_per_sample_minutes, is_sample_dependent, samples_per_batch, extra_duration_minutes, is_overnight, pattern_label, order_index, sub_protocol_id, routine_name, routine_duration_days, routine_recurrence, routine_recurrence_days) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
  ).run(req.params.id, name, description || '', duration_minutes || 0, req.body.time_per_sample_minutes || 0, req.body.is_sample_dependent ? 1 : 0, req.body.samples_per_batch || 1, extra_duration_minutes || 0, is_overnight ? 1 : 0, pattern_label || 'default', idx, sub_protocol_id || null, routine_name || null, routine_duration_days || null, routine_recurrence || null, routine_recurrence_days || null);
  
  const stepId = result.lastInsertRowid;
  
  if (preparations && Array.isArray(preparations)) {
    const insertPrep = db.prepare('INSERT INTO step_preparations (step_id, message, timing_type, timing_step_id, timing_offset_minutes, requires_check) VALUES (?, ?, ?, ?, ?, ?)');
    for (const prep of preparations) {
      insertPrep.run(stepId, prep.message, prep.timing_type || 'before_experiment', prep.timing_step_id || null, prep.timing_offset_minutes || 0, prep.requires_check ? 1 : 0);
    }
  }
  
  const created = db.prepare('SELECT * FROM steps WHERE id = ?').get(stepId) as any;
  created.preparations = db.prepare('SELECT * FROM step_preparations WHERE step_id = ?').all(stepId);
  res.status(201).json(created);
});

// ==================== BLOCKS ====================

// GET blocks for experiment type with their steps
router.get('/:id/blocks', (req, res) => {
  const expType = db.prepare('SELECT id FROM experiment_types WHERE id = ? AND user_id = ?').get(req.params.id, req.userId);
  if (!expType) return res.status(403).json({ message: 'Forbidden' });

  const blocks = db.prepare(
    'SELECT * FROM blocks WHERE experiment_type_id = ? ORDER BY pattern_label, order_index'
  ).all(req.params.id) as any[];
  
  for (const block of blocks) {
    block.steps = db.prepare(`
      SELECT bs.*, s.name as step_name, s.description as step_description, s.duration_minutes, s.extra_duration_minutes, s.is_sample_dependent, s.samples_per_batch, s.pattern_label as step_pattern
      FROM block_steps bs
      JOIN steps s ON bs.step_id = s.id
      WHERE bs.block_id = ?
      ORDER BY bs.order_index, bs.branch_index, bs.id
    `).all(block.id);
  }
  
  res.json(blocks);
});

// POST create block
router.post('/:id/blocks', (req, res) => {
  const expType = db.prepare('SELECT id FROM experiment_types WHERE id = ? AND user_id = ?').get(req.params.id, req.userId);
  if (!expType) return res.status(403).json({ message: 'Forbidden' });

  const { name, description, pattern_label, order_index, step_nodes } = req.body;
  if (!name) return res.status(400).json({ message: 'Name is required' });
  
  let idx = order_index;
  if (idx === undefined || idx === null) {
    const max = db.prepare(
      'SELECT COALESCE(MAX(order_index), -1) as max_idx FROM blocks WHERE experiment_type_id = ? AND pattern_label = ?'
    ).get(req.params.id, pattern_label || 'default') as any;
    idx = (max?.max_idx ?? -1) + 1;
  }

  const result = db.prepare(
    'INSERT INTO blocks (experiment_type_id, name, description, pattern_label, order_index) VALUES (?, ?, ?, ?, ?)'
  ).run(req.params.id, name, description || '', pattern_label || 'default', idx);
  
  const blockId = result.lastInsertRowid;
  
  if (step_nodes && Array.isArray(step_nodes)) {
    const insertBlockStep = db.prepare(
      'INSERT INTO block_steps (block_id, step_id, order_index, branch_index, delay_minutes) VALUES (?, ?, ?, ?, ?)'
    );
    const getStep = db.prepare('SELECT is_overnight FROM steps WHERE id = ?');
    
    for (let i = 0; i < step_nodes.length; i++) {
      const stage = step_nodes[i];
      for (let j = 0; j < stage.length; j++) {
        const branch = stage[j];
        for (let k = 0; k < branch.length; k++) {
          const node = branch[k];
          const stepInfo = getStep.get(node.step_id) as any;
          if (stepInfo?.is_overnight === 1 && i !== step_nodes.length - 1) {
            db.prepare('DELETE FROM blocks WHERE id = ?').run(blockId); // Rollback
            return res.status(400).json({ message: 'オーバーナイトステップはブロックの最後にしか配置できません' });
          }
          insertBlockStep.run(blockId, node.step_id, i, j, node.delay_minutes || 0);
        }
      }
    }
  }
  
  const created = db.prepare('SELECT * FROM blocks WHERE id = ?').get(blockId);
  res.status(201).json(created);
});

// ==================== PROTOCOLS ====================

// GET all protocols (optionally by experiment type)
router.get('/:id/protocols', (req, res) => {
  const expType = db.prepare('SELECT id FROM experiment_types WHERE id = ? AND user_id = ?').get(req.params.id, req.userId);
  if (!expType) return res.status(403).json({ message: 'Forbidden' });

  const protocols = db.prepare(
    'SELECT * FROM protocols WHERE experiment_type_id = ? AND user_id = ? ORDER BY created_at DESC'
  ).all(req.params.id, req.userId) as any[];
  
  for (const protocol of protocols) {
    protocol.blocks = db.prepare(`
      SELECT pb.*, b.name as block_name, b.description as block_description, b.pattern_label
      FROM protocol_blocks pb
      JOIN blocks b ON pb.block_id = b.id
      WHERE pb.protocol_id = ?
      ORDER BY pb.day_offset, pb.order_index
    `).all(protocol.id);
  }
  
  res.json(protocols);
});

// POST create protocol
router.post('/:id/protocols', (req, res) => {
  const expType = db.prepare('SELECT id FROM experiment_types WHERE id = ? AND user_id = ?').get(req.params.id, req.userId);
  if (!expType) return res.status(403).json({ message: 'Forbidden' });

  const { name, description, color, blocks } = req.body;
  if (!name) return res.status(400).json({ message: 'Name is required' });
  
  const result = db.prepare(
    'INSERT INTO protocols (user_id, experiment_type_id, name, description, color) VALUES (?, ?, ?, ?, ?)'
  ).run(req.userId, req.params.id, name, description || '', color || '#6366F1');
  
  const protocolId = result.lastInsertRowid;
  
  if (blocks && Array.isArray(blocks)) {
    const insertPB = db.prepare(
      'INSERT INTO protocol_blocks (protocol_id, block_id, day_offset, order_index) VALUES (?, ?, ?, ?)'
    );
    blocks.forEach((b: { block_id: number; day_offset: number }, i: number) => {
      insertPB.run(protocolId, b.block_id, b.day_offset, i);
    });
  }
  
  const created = db.prepare('SELECT * FROM protocols WHERE id = ?').get(protocolId);
  res.status(201).json(created);
});

export default router;
