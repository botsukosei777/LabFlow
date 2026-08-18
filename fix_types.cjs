const fs = require('fs');
let c = fs.readFileSync('src/types/index.ts', 'utf-8');
c = c.replace(/time_per_sample_minutes\?:\s*number;/, "time_per_sample_minutes?: number;\n  is_sample_dependent?: number;\n  samples_per_batch?: number;");
fs.writeFileSync('src/types/index.ts', c);
