const fs = require('fs');
let c = fs.readFileSync('src/pages/Dashboard.tsx', 'utf-8');

c = c.replace(/step\.is_sample_dependent === 1/g, 'step.is_sample_dependent');

fs.writeFileSync('src/pages/Dashboard.tsx', c);
