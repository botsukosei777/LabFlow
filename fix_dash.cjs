const fs = require('fs');
let c = fs.readFileSync('src/pages/Dashboard.tsx', 'utf-8');
c = c.replace(/step\.duration_minutes\}min/g, 'step.duration_minutes + ((step.time_per_sample_minutes || 0) * (block.sample_count || 1))}min');
fs.writeFileSync('src/pages/Dashboard.tsx', c);
