import { Router } from 'express';
import db from '../db/database.js';
import { recalculateBlockSchedule } from '../services/scheduleHelper.js';

const router = Router();

function addMinutes(timeStr: string, minutes: number): string {
  if (!timeStr) return '00:00';
  const [h, m] = timeStr.split(':').map(Number);
  const date = new Date(2000, 0, 1, h || 0, m || 0);
  date.setMinutes(date.getMinutes() + (minutes || 0));
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
}

// GET scheduled experiments for date range
router.get('/', (req, res) => {
  const { start, end } = req.query;
  let query = `
    SELECT se.*, p.name as protocol_name, e.name as experiment_type_name, e.color
    FROM scheduled_experiments se
    JOIN protocols p ON se.protocol_id = p.id
    JOIN experiment_types e ON p.experiment_type_id = e.id
    WHERE se.user_id = ?
  `;
  const params: (string | number)[] = [req.userId as number];
  if (start && end) {
    query += ` AND se.id IN (
      SELECT DISTINCT scheduled_experiment_id FROM scheduled_blocks
      WHERE scheduled_date >= ? AND scheduled_date <= ?
    )`;
    params.push(start as string, end as string);
  }
  query += ' ORDER BY se.start_date DESC';
  const experiments = db.prepare(query).all(...params) as any[];
  
  for (const exp of experiments) {
    exp.blocks = db.prepare(`
      SELECT sb.*, pb.day_offset, b.name as block_name
      FROM scheduled_blocks sb
      JOIN protocol_blocks pb ON sb.protocol_block_id = pb.id
      JOIN blocks b ON pb.block_id = b.id
      WHERE sb.scheduled_experiment_id = ?
      ORDER BY sb.scheduled_date
    `).all(exp.id);
  }
  res.json(experiments);
});

// GET today's schedule
router.get('/today', (req, res) => {
  const today = new Date().toISOString().split('T')[0];
  const blocks = db.prepare(`
    SELECT sb.*, se.label, se.mode, se.status as experiment_status,
           p.name as protocol_name, e.name as experiment_type_name, e.color,
           b.name as block_name, b.description as block_description
    FROM scheduled_blocks sb
    JOIN scheduled_experiments se ON sb.scheduled_experiment_id = se.id
    JOIN protocols p ON se.protocol_id = p.id
    JOIN experiment_types e ON p.experiment_type_id = e.id
    JOIN protocol_blocks pb ON sb.protocol_block_id = pb.id
    JOIN blocks b ON pb.block_id = b.id
    WHERE sb.scheduled_date = ? AND se.status != 'cancelled' AND se.user_id = ?
    ORDER BY se.start_date
  `).all(today, req.userId) as any[];
  
  for (const block of blocks) {
    if (block.mode === 'management') {
      block.steps = db.prepare(`
        SELECT ss.*, bs.order_index, s.name as step_name, s.description as step_description, 
               s.duration_minutes, s.is_overnight, s.sub_protocol
        FROM scheduled_steps ss
        JOIN block_steps bs ON ss.block_step_id = bs.id
        JOIN steps s ON bs.step_id = s.id
        WHERE ss.scheduled_block_id = ?
        ORDER BY bs.order_index
      `).all(block.id);
      
      for (const step of block.steps) {
        step.preparations = db.prepare(`
          SELECT ssp.id, ssp.is_completed, sp.message, sp.timing_type, sp.timing_offset_minutes, sp.requires_check
          FROM scheduled_step_preparations ssp
          JOIN step_preparations sp ON ssp.step_preparation_id = sp.id
          WHERE ssp.scheduled_step_id = ?
        `).all(step.id);
      }
    }
  }
  res.json(blocks);
});

// GET all scheduled blocks for calendar
router.get('/blocks', (req, res) => {
  const blocks = db.prepare(`
    SELECT sb.*, se.label, se.mode, se.status as experiment_status,
           p.name as protocol_name, e.name as experiment_type_name, e.color,
           b.name as block_name
    FROM scheduled_blocks sb
    JOIN scheduled_experiments se ON sb.scheduled_experiment_id = se.id
    JOIN protocols p ON se.protocol_id = p.id
    JOIN experiment_types e ON p.experiment_type_id = e.id
    JOIN protocol_blocks pb ON sb.protocol_block_id = pb.id
    JOIN blocks b ON pb.block_id = b.id
    WHERE se.status != 'cancelled' AND se.user_id = ?
    ORDER BY sb.scheduled_date
  `).all(req.userId) as any[];

  const getSteps = db.prepare(`
    SELECT ss.*, bs.order_index, s.name as step_name, s.description as step_description,
           s.duration_minutes, s.is_overnight
    FROM scheduled_steps ss
    JOIN block_steps bs ON ss.block_step_id = bs.id
    JOIN steps s ON bs.step_id = s.id
    WHERE ss.scheduled_block_id = ?
    ORDER BY bs.order_index
  `);
  
  for (const block of blocks) {
    if (block.mode === 'management') {
      block.steps = getSteps.all(block.id);
    }
  }

  res.json(blocks);
});

// POST schedule an experiment
router.post('/', (req, res) => {
  const { protocol_id, start_date, block_start_times, mode, label, notes } = req.body;
  if (!protocol_id || !start_date) {
    return res.status(400).json({ message: 'protocol_id and start_date are required' });
  }
  
  const protocol = db.prepare('SELECT id, experiment_type_id FROM protocols WHERE id = ? AND user_id = ?').get(protocol_id, req.userId) as any;
  if (!protocol) return res.status(403).json({ message: 'Forbidden' });

  const protocolBlocks = db.prepare(`
    SELECT pb.*, b.name as block_name
    FROM protocol_blocks pb
    JOIN blocks b ON pb.block_id = b.id
    WHERE pb.protocol_id = ?
    ORDER BY pb.day_offset, pb.order_index
  `).all(protocol_id) as any[];
  
  if (protocolBlocks.length === 0) return res.status(400).json({ message: 'Protocol has no blocks' });
  
  const initialStartTime = block_start_times && Object.values(block_start_times).length > 0 ? Object.values(block_start_times)[0] : '09:00';
  const result = db.prepare(
    'INSERT INTO scheduled_experiments (user_id, protocol_id, start_date, start_time, mode, label, notes) VALUES (?, ?, ?, ?, ?, ?, ?)'
  ).run(req.userId, protocol_id, start_date, initialStartTime, mode || 'management', label || '', notes || '');
  
  const experimentId = result.lastInsertRowid;
  const startDateObj = new Date(start_date + 'T00:00:00');
  
  const insertBlock = db.prepare(
    'INSERT INTO scheduled_blocks (scheduled_experiment_id, protocol_block_id, scheduled_date, end_date, start_time, end_time) VALUES (?, ?, ?, ?, ?, ?)'
  );
  
  const insertStep = db.prepare(
    'INSERT INTO scheduled_steps (scheduled_block_id, block_step_id, start_time, end_time) VALUES (?, ?, ?, ?)'
  );
  
  const warnings: string[] = [];
  
  for (const pb of protocolBlocks) {
    const blockDate = new Date(startDateObj);
    blockDate.setDate(blockDate.getDate() + pb.day_offset - 1);
    const dateStr = `${blockDate.getFullYear()}-${String(blockDate.getMonth()+1).padStart(2,'0')}-${String(blockDate.getDate()).padStart(2,'0')}`;
    
    let currentStartTime = block_start_times && block_start_times[pb.id] ? block_start_times[pb.id] : '09:00';
    
    // 1. Initial block insertion (placeholder times)
    const blockResult = insertBlock.run(experimentId, pb.id, dateStr, dateStr, currentStartTime, currentStartTime);
    const blockId = blockResult.lastInsertRowid;
    
    if ((mode || 'management') === 'management') {
      const blockSteps = db.prepare(
        'SELECT bs.id, bs.step_id, s.duration_minutes, s.is_overnight FROM block_steps bs JOIN steps s ON bs.step_id = s.id WHERE bs.block_id = ? ORDER BY bs.order_index'
      ).all(pb.block_id) as any[];
      
      const insertPrep = db.prepare('INSERT INTO scheduled_step_preparations (scheduled_step_id, step_preparation_id) VALUES (?, ?)');
      
      // 2. Insert steps with initial default times
      for (const bs of blockSteps) {
        const stepResult = insertStep.run(blockId, bs.id, currentStartTime, currentStartTime);
        const scheduledStepId = stepResult.lastInsertRowid;
        
        // Insert any preparations for this step
        const preps = db.prepare('SELECT id FROM step_preparations WHERE step_id = ?').all(bs.step_id) as any[];
        for (const prep of preps) {
          insertPrep.run(scheduledStepId, prep.id);
        }
      }
      
      // 3. Recalculate block to avoid events correctly
      recalculateBlockSchedule(db, req.userId as number, blockId as number, dateStr, warnings);
    }
  }
  
  const created = db.prepare('SELECT * FROM scheduled_experiments WHERE id = ?').get(experimentId) as any;
  created.warnings = warnings;
  res.status(201).json(created);
});

// PUT steps/:id/time (Dynamic intra-block delay)
router.put('/steps/:id/time', (req, res) => {
  const { start_time, end_time } = req.body;
  const stepId = req.params.id;
  
  const stepInfo = db.prepare(`
    SELECT ss.*, sb.id as block_id, sb.scheduled_date, bs.order_index 
    FROM scheduled_steps ss
    JOIN scheduled_blocks sb ON ss.scheduled_block_id = sb.id
    JOIN block_steps bs ON ss.block_step_id = bs.id
    JOIN scheduled_experiments se ON sb.scheduled_experiment_id = se.id
    WHERE ss.id = ? AND se.user_id = ?
  `).get(stepId, req.userId) as any;
  
  if (!stepInfo) return res.status(403).json({ message: 'Forbidden' });
  
  db.prepare('UPDATE scheduled_steps SET start_time = ?, end_time = ? WHERE id = ?').run(start_time, end_time, stepId);
  
  // Use shared helper to recalculate rest of the block and avoid events
  const warnings: string[] = [];
  recalculateBlockSchedule(db, req.userId as number, stepInfo.block_id, stepInfo.scheduled_date, warnings);
  
  res.json({ message: 'Time shifted successfully', warnings });
});

// PUT /preparations/:id/complete
router.put('/preparations/:id/complete', (req, res) => {
  const prepId = req.params.id;
  db.prepare('UPDATE scheduled_step_preparations SET is_completed = 1, completed_at = ? WHERE id = ?')
    .run(new Date().toISOString(), prepId);
  res.json({ message: 'Preparation completed' });
});

// PUT /preparations/:id/incomplete
router.put('/preparations/:id/incomplete', (req, res) => {
  const prepId = req.params.id;
  db.prepare('UPDATE scheduled_step_preparations SET is_completed = 0, completed_at = NULL WHERE id = ?')
    .run(prepId);
  res.json({ message: 'Preparation marked incomplete' });
});

// POST /:id/postpone (Flexible block splitting & shifting)
router.post('/:id/postpone', (req, res) => {
  const { step_id, target_date, target_time } = req.body;
  const expId = req.params.id;
  
  const exp = db.prepare('SELECT user_id FROM scheduled_experiments WHERE id = ?').get(expId) as any;
  if (!exp || exp.user_id !== req.userId) return res.status(403).json({ message: 'Forbidden' });

  const stepInfo = db.prepare(`
    SELECT ss.*, sb.id as source_block_id, sb.protocol_block_id, bs.order_index
    FROM scheduled_steps ss
    JOIN scheduled_blocks sb ON ss.scheduled_block_id = sb.id
    JOIN block_steps bs ON ss.block_step_id = bs.id
    WHERE ss.id = ? AND sb.scheduled_experiment_id = ?
  `).get(step_id, expId) as any;
  
  if (!stepInfo) return res.status(404).json({ message: 'Step not found' });
  
  const stepsToMove = db.prepare(`
    SELECT ss.id, s.duration_minutes, bs.id as block_step_id, s.is_overnight
    FROM scheduled_steps ss
    JOIN block_steps bs ON ss.block_step_id = bs.id
    JOIN steps s ON bs.step_id = s.id
    WHERE ss.scheduled_block_id = ? AND bs.order_index >= ?
    ORDER BY bs.order_index
  `).all(stepInfo.source_block_id, stepInfo.order_index) as any[];
  
  if (stepsToMove.length === 0) return res.json({ message: 'No steps to move' });
  
  const totalMoveMinutes = stepsToMove.reduce((acc, step) => acc + (step.is_overnight === 1 ? 0 : step.duration_minutes), 0);
  
  // Check if target date has a block for this experiment
  const targetBlock = db.prepare('SELECT * FROM scheduled_blocks WHERE scheduled_experiment_id = ? AND scheduled_date = ? ORDER BY id ASC LIMIT 1').get(expId, target_date) as any;
  
  let targetBlockId;
  let absorb = false;
  
  if (targetBlock) {
    const targetSteps = db.prepare(`
      SELECT s.duration_minutes, s.is_overnight
      FROM scheduled_steps ss
      JOIN block_steps bs ON ss.block_step_id = bs.id
      JOIN steps s ON bs.step_id = s.id
      WHERE ss.scheduled_block_id = ?
    `).all(targetBlock.id) as any[];
    
    const targetMinutes = targetSteps.reduce((acc, step) => acc + (step.is_overnight === 1 ? 0 : step.duration_minutes), 0);
    
    if (totalMoveMinutes + targetMinutes <= 720) {
      absorb = true;
      targetBlockId = targetBlock.id;
    }
  }
  
  if (!absorb) {
    // We need to shift blocks from target_date onwards
    const blocksToShift = db.prepare(
      'SELECT * FROM scheduled_blocks WHERE scheduled_experiment_id = ? AND scheduled_date >= ? AND id != ? ORDER BY scheduled_date DESC'
    ).all(expId, target_date, stepInfo.source_block_id) as any[];
    
    const updateDate = db.prepare('UPDATE scheduled_blocks SET scheduled_date = ? WHERE id = ?');
    for (const b of blocksToShift) {
      const bDate = new Date(b.scheduled_date + 'T00:00:00');
      bDate.setDate(bDate.getDate() + 1);
      updateDate.run(bDate.toISOString().split('T')[0], b.id);
    }
    
    // Create new block on target date
    const newBlock = db.prepare(
      'INSERT INTO scheduled_blocks (scheduled_experiment_id, protocol_block_id, scheduled_date, start_time, end_time) VALUES (?, ?, ?, ?, ?)'
    ).run(expId, stepInfo.protocol_block_id, target_date, target_time || '09:00', target_time || '09:00');
    targetBlockId = newBlock.lastInsertRowid;
  }
  
  // Move steps to targetBlockId
  const updateStepBlock = db.prepare('UPDATE scheduled_steps SET scheduled_block_id = ? WHERE id = ?');
  for (const s of stepsToMove) {
    updateStepBlock.run(targetBlockId, s.id);
  }
  
  // Recalculate times for target block
  const allTargetSteps = db.prepare(`
    SELECT ss.id, s.duration_minutes, s.is_overnight
    FROM scheduled_steps ss
    JOIN block_steps bs ON ss.block_step_id = bs.id
    JOIN steps s ON bs.step_id = s.id
    WHERE ss.scheduled_block_id = ?
    ORDER BY bs.order_index
  `).all(targetBlockId) as any[];
  
  let currentStartTime = absorb && targetBlock ? targetBlock.start_time : (target_time || '09:00');
  const updateTime = db.prepare('UPDATE scheduled_steps SET start_time = ?, end_time = ? WHERE id = ?');
  for (const s of allTargetSteps) {
    const sStart = currentStartTime;
    const sEnd = s.is_overnight === 1 ? '23:59' : addMinutes(currentStartTime, s.duration_minutes);
    updateTime.run(sStart, sEnd, s.id);
    currentStartTime = sEnd;
  }
  const blockFinalStartTime = absorb && targetBlock ? targetBlock.start_time : (target_time || '09:00');
  db.prepare('UPDATE scheduled_blocks SET start_time = ?, end_time = ? WHERE id = ?').run(blockFinalStartTime, currentStartTime, targetBlockId);
  
  // Recalculate original source block end time
  const remainingSourceSteps = db.prepare(`
    SELECT ss.id, ss.start_time, ss.end_time
    FROM scheduled_steps ss
    JOIN block_steps bs ON ss.block_step_id = bs.id
    WHERE ss.scheduled_block_id = ?
    ORDER BY bs.order_index DESC LIMIT 1
  `).get(stepInfo.source_block_id) as any;
  
  if (remainingSourceSteps) {
    db.prepare('UPDATE scheduled_blocks SET end_time = ? WHERE id = ?').run(remainingSourceSteps.end_time, stepInfo.source_block_id);
  } else {
    db.prepare('DELETE FROM scheduled_blocks WHERE id = ?').run(stepInfo.source_block_id);
  }
  
  res.json({ message: 'Postponed successfully', absorbed: absorb });
});

// POST delay a block (cascading)
router.post('/:id/delay', (req, res) => {
  const { block_id, new_date } = req.body;
  if (!block_id || !new_date) return res.status(400).json({ message: 'block_id and new_date are required' });
  const block = db.prepare('SELECT * FROM scheduled_blocks WHERE id = ? AND scheduled_experiment_id = ?').get(block_id, req.params.id) as any;
  if (!block) return res.status(404).json({ message: 'Block not found' });
  
  const oldDate = new Date(block.scheduled_date + 'T00:00:00');
  const newDate = new Date(new_date + 'T00:00:00');
  const deltaDays = Math.round((newDate.getTime() - oldDate.getTime()) / (1000 * 60 * 60 * 24));
  
  const allBlocks = db.prepare('SELECT * FROM scheduled_blocks WHERE scheduled_experiment_id = ? AND scheduled_date >= ? ORDER BY scheduled_date').all(req.params.id, block.scheduled_date) as any[];
  const updateBlock = db.prepare('UPDATE scheduled_blocks SET scheduled_date = ? WHERE id = ?');
  for (const b of allBlocks) {
    const bDate = new Date(b.scheduled_date + 'T00:00:00');
    bDate.setDate(bDate.getDate() + deltaDays);
    updateBlock.run(bDate.toISOString().split('T')[0], b.id);
  }
  res.json({ message: 'Schedule updated', delta_days: deltaDays });
});

// PUT complete a block
router.put('/blocks/:blockId/complete', (req, res) => {
  const blockInfo = db.prepare(`
    SELECT se.user_id, se.id as exp_id
    FROM scheduled_blocks sb
    JOIN scheduled_experiments se ON sb.scheduled_experiment_id = se.id
    WHERE sb.id = ?
  `).get(req.params.blockId) as any;
  if (!blockInfo || blockInfo.user_id !== req.userId) return res.status(403).json({ message: 'Forbidden' });

  db.prepare(`UPDATE scheduled_blocks SET status = 'completed', completed_at = datetime('now', 'localtime') WHERE id = ?`).run(req.params.blockId);
  db.prepare(`UPDATE scheduled_steps SET status = 'completed', completed_at = datetime('now', 'localtime') WHERE scheduled_block_id = ?`).run(req.params.blockId);
  
  const pending = db.prepare(`SELECT COUNT(*) as count FROM scheduled_blocks WHERE scheduled_experiment_id = ? AND status != 'completed' AND status != 'skipped'`).get(blockInfo.exp_id) as any;
  if (pending.count === 0) {
    db.prepare(`UPDATE scheduled_experiments SET status = 'completed', updated_at = datetime('now', 'localtime') WHERE id = ?`).run(blockInfo.exp_id);
  } else {
    db.prepare(`UPDATE scheduled_experiments SET status = 'in_progress', updated_at = datetime('now', 'localtime') WHERE id = ?`).run(blockInfo.exp_id);
  }
  res.json({ message: 'Block completed' });
});

// PUT complete a step
router.put('/steps/:stepId/complete', (req, res) => {
  const stepInfo = db.prepare(`
    SELECT se.user_id, ss.end_time, sb.scheduled_date, sb.id as block_id, bs.order_index 
    FROM scheduled_steps ss
    JOIN scheduled_blocks sb ON ss.scheduled_block_id = sb.id
    JOIN block_steps bs ON ss.block_step_id = bs.id
    JOIN scheduled_experiments se ON sb.scheduled_experiment_id = se.id
    WHERE ss.id = ?
  `).get(req.params.stepId) as any;
  if (!stepInfo || stepInfo.user_id !== req.userId) return res.status(403).json({ message: 'Forbidden' });

  // Handle auto-postpone
  const now = new Date();
  const offsetMs = now.getTimezoneOffset() * 60 * 1000;
  const localNow = new Date(now.getTime() - offsetMs);
  const todayDateStr = localNow.toISOString().split('T')[0];
  const currentHM = `${String(localNow.getUTCHours()).padStart(2, '0')}:${String(localNow.getUTCMinutes()).padStart(2, '0')}`;

  if (stepInfo.scheduled_date === todayDateStr && currentHM > stepInfo.end_time) {
    const setting = db.prepare('SELECT value FROM settings WHERE key = ? AND user_id = ?').get('auto_postpone_steps', req.userId) as any;
    if (setting && setting.value === 'true') {
      const subsequentSteps = db.prepare(`
        SELECT ss.id, ss.start_time, ss.end_time, s.duration_minutes, s.is_overnight
        FROM scheduled_steps ss
        JOIN block_steps bs ON ss.block_step_id = bs.id
        JOIN steps s ON bs.step_id = s.id
        WHERE ss.scheduled_block_id = ? AND bs.order_index > ?
        ORDER BY bs.order_index
      `).all(stepInfo.block_id, stepInfo.order_index) as any[];

      if (subsequentSteps.length > 0) {
        let currentTime = currentHM;
        const updateStep = db.prepare('UPDATE scheduled_steps SET start_time = ?, end_time = ? WHERE id = ?');
        for (const sub of subsequentSteps) {
          const sStart = currentTime;
          const sEnd = sub.is_overnight === 1 ? '23:59' : addMinutes(currentTime, sub.duration_minutes);
          updateStep.run(sStart, sEnd, sub.id);
          currentTime = sEnd;
        }
        db.prepare('UPDATE scheduled_blocks SET end_time = ? WHERE id = ?').run(currentTime, stepInfo.block_id);
      }
    }
  }

  db.prepare(`UPDATE scheduled_steps SET status = 'completed', completed_at = datetime('now', 'localtime') WHERE id = ?`).run(req.params.stepId);
  res.json({ message: 'Step completed' });
});
// PUT incomplete a step
router.put('/steps/:stepId/incomplete', (req, res) => {
  const stepInfo = db.prepare(`
    SELECT se.user_id, ss.end_time, sb.id as block_id, bs.order_index, se.id as exp_id
    FROM scheduled_steps ss
    JOIN scheduled_blocks sb ON ss.scheduled_block_id = sb.id
    JOIN block_steps bs ON ss.block_step_id = bs.id
    JOIN scheduled_experiments se ON sb.scheduled_experiment_id = se.id
    WHERE ss.id = ?
  `).get(req.params.stepId) as any;
  if (!stepInfo || stepInfo.user_id !== req.userId) return res.status(403).json({ message: 'Forbidden' });

  // Handle auto-rewind
  const setting = db.prepare('SELECT value FROM settings WHERE key = ? AND user_id = ?').get('auto_postpone_steps', req.userId) as any;
  if (setting && setting.value === 'true') {
    const subsequentSteps = db.prepare(`
      SELECT ss.id, ss.start_time, ss.end_time, s.duration_minutes, s.is_overnight
      FROM scheduled_steps ss
      JOIN block_steps bs ON ss.block_step_id = bs.id
      JOIN steps s ON bs.step_id = s.id
      WHERE ss.scheduled_block_id = ? AND bs.order_index > ?
      ORDER BY bs.order_index
    `).all(stepInfo.block_id, stepInfo.order_index) as any[];

    if (subsequentSteps.length > 0) {
      let currentTime = stepInfo.end_time;
      const updateStep = db.prepare('UPDATE scheduled_steps SET start_time = ?, end_time = ? WHERE id = ?');
      for (const sub of subsequentSteps) {
        const sStart = currentTime;
        const sEnd = sub.is_overnight === 1 ? '23:59' : addMinutes(currentTime, sub.duration_minutes);
        updateStep.run(sStart, sEnd, sub.id);
        currentTime = sEnd;
      }
      db.prepare('UPDATE scheduled_blocks SET end_time = ? WHERE id = ?').run(currentTime, stepInfo.block_id);
    }
  }

  db.prepare(`UPDATE scheduled_steps SET status = 'pending', completed_at = NULL WHERE id = ?`).run(req.params.stepId);
  db.prepare(`UPDATE scheduled_blocks SET status = 'pending', completed_at = NULL WHERE id = ?`).run(stepInfo.block_id);
  db.prepare(`UPDATE scheduled_experiments SET status = 'in_progress', updated_at = datetime('now', 'localtime') WHERE id = ?`).run(stepInfo.exp_id);
  
  res.json({ message: 'Step marked incomplete' });
});

// DELETE scheduled experiment
router.delete('/:id', (req, res) => {
  db.prepare('DELETE FROM scheduled_experiments WHERE id = ? AND user_id = ?').run(req.params.id, req.userId);
  res.status(204).send();
});

// PUT update scheduled experiment
router.put('/:id', (req, res) => {
  const { label, notes, status } = req.body;
  db.prepare(
    `UPDATE scheduled_experiments SET label = ?, notes = ?, status = ?, updated_at = datetime('now', 'localtime') WHERE id = ? AND user_id = ?`
  ).run(label, notes, status, req.params.id, req.userId);
  const updated = db.prepare('SELECT * FROM scheduled_experiments WHERE id = ? AND user_id = ?').get(req.params.id, req.userId);
  res.json(updated);
});

export default router;
