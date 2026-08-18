const fs = require('fs');
let c = fs.readFileSync('server/routes/schedule.ts', 'utf-8');

c = c.replace(/s\.duration_minutes,\s*s\.time_per_sample_minutes/g, 's.duration_minutes, s.is_sample_dependent, s.samples_per_batch');

fs.writeFileSync('server/routes/schedule.ts', c);
