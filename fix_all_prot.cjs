const fs = require('fs');
let c = fs.readFileSync('server/routes/experiments.ts', 'utf-8');

const regex = /protocol\.blocks = db\.prepare\([\s\S]*?\}\);/m;
const replacement = `protocol.blocks = db.prepare(\`
      SELECT pb.*, b.name as block_name
      FROM protocol_blocks pb
      JOIN blocks b ON pb.block_id = b.id
      WHERE pb.protocol_id = ?
      ORDER BY pb.day_offset
    \`).all(protocol.id);
    
    const hasSampleDep = db.prepare(\`
      SELECT COUNT(*) as cnt
      FROM protocol_blocks pb
      JOIN block_steps bs ON pb.block_id = bs.block_id
      JOIN steps s ON bs.step_id = s.id
      WHERE pb.protocol_id = ? AND s.is_sample_dependent = 1
    \`).get(protocol.id) as any;
    protocol.has_sample_dependent_steps = hasSampleDep.cnt > 0;
  }`;
  
c = c.replace(/for \(const protocol of protocols\) \{\s*protocol\.blocks = db\.prepare\(`[\s\S]*?`\)\.all\(protocol\.id\);\s*\}/m, `for (const protocol of protocols) {\n    ${replacement}`);

fs.writeFileSync('server/routes/experiments.ts', c);
