const fs = require('fs');
let c = fs.readFileSync('server/routes/schedule.ts', 'utf-8');
c = c.replace(/s\.duration_minutes/g, 's.duration_minutes, s.time_per_sample_minutes');
c = c.replace(/se\.color, p\.color, e\.color\) as color/g, 'se.color, p.color, e.color) as color, se.sample_count');
fs.writeFileSync('server/routes/schedule.ts', c);
