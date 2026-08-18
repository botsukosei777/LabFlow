const fs = require('fs');
let c = fs.readFileSync('server/routes/schedule.ts', 'utf-8');

c = c.replace(/SELECT sb\.\*, se\.label, se\.mode, se\.status as experiment_status, se\.start_time as start_time,/g, 'SELECT sb.*, se.label, se.mode, se.status as experiment_status, se.start_time as experiment_start_time,');

fs.writeFileSync('server/routes/schedule.ts', c);
