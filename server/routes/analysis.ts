import { Router } from 'express';
import db from '../db/database.js';

const router = Router();

// GET analysis data for a protocol
router.get('/duration/:protocolId', (req, res) => {
  const { protocolId } = req.params;
  const userId = req.userId;

  try {
    const experiments = db.prepare(`
      SELECT se.id, se.start_date, se.label, se.sample_count, p.name as protocol_name, p.id as protocol_id
      FROM scheduled_experiments se
      JOIN protocols p ON se.protocol_id = p.id
      WHERE p.id = ? AND se.user_id = ? AND se.mode = 'management'
      ORDER BY se.start_date ASC
    `).all(protocolId, userId) as any[];

    for (const exp of experiments) {
      exp.blocks = db.prepare(`
        SELECT sb.id, sb.scheduled_date, b.name as block_name, pb.day_offset
        FROM scheduled_blocks sb
        JOIN protocol_blocks pb ON sb.protocol_block_id = pb.id
        JOIN blocks b ON pb.block_id = b.id
        WHERE sb.scheduled_experiment_id = ?
        ORDER BY pb.day_offset, pb.order_index
      `).all(exp.id) as any[];

      for (const block of exp.blocks) {
        block.steps = db.prepare(`
          SELECT ss.id, ss.status, ss.completed_at, ss.start_time, ss.start_date,
                 s.name as step_name, s.duration_minutes, s.is_sample_dependent, s.samples_per_batch,
                 bs.order_index
          FROM scheduled_steps ss
          JOIN block_steps bs ON ss.block_step_id = bs.id
          JOIN steps s ON bs.step_id = s.id
          WHERE ss.scheduled_block_id = ?
          ORDER BY bs.order_index ASC
        `).all(block.id) as any[];
      }
    }

    res.json(experiments);
  } catch (error) {
    console.error('Error fetching analysis data:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// GET protocols that have analysis data, labeled with experiment type name
router.get('/protocols', (req, res) => {
  const userId = req.userId;
  try {
    const protocols = db.prepare(`
      SELECT DISTINCT p.id, p.name as protocol_name, et.name as experiment_type_name, et.color
      FROM protocols p
      JOIN experiment_types et ON p.experiment_type_id = et.id
      JOIN scheduled_experiments se ON se.protocol_id = p.id
      WHERE se.user_id = ? AND se.mode = 'management'
      ORDER BY et.name ASC, p.name ASC
    `).all(userId) as any[];
    res.json(protocols);
  } catch (error) {
    res.status(500).json({ message: 'Internal server error' });
  }
});

export default router;
