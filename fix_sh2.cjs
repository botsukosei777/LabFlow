const fs = require('fs');
let c = fs.readFileSync('server/services/scheduleHelper.ts', 'utf-8');

c = c.replace(/step\.is_sample_dependent === 1/g, 'step.is_sample_dependent');

fs.writeFileSync('server/services/scheduleHelper.ts', c);
