const fs = require('fs');
let c = fs.readFileSync('src/pages/Dashboard.tsx', 'utf-8');

c = c.replace(/step\.duration_minutes \+ \(\(step\.time_per_sample_minutes \|\| 0\) \* \(block\.sample_count \|\| 1\)\)/g, '(step.is_sample_dependent === 1 ? step.duration_minutes * Math.ceil((block.sample_count || 1) / (step.samples_per_batch || 1)) : step.duration_minutes)');

fs.writeFileSync('src/pages/Dashboard.tsx', c);
