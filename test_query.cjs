const sqlite3 = require('better-sqlite3');
const db = new sqlite3('data/labflow.db');
const result = db.prepare(`
    SELECT p.id, p.name, (
      SELECT COUNT(*)
      FROM protocol_blocks pb
      JOIN block_steps bs ON pb.block_id = bs.block_id
      JOIN steps s ON bs.step_id = s.id
      WHERE pb.protocol_id = p.id AND s.is_sample_dependent = 1
    ) as cnt
    FROM protocols p
`).all();
console.log(result);
