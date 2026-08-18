const fs = require('fs');
let c = fs.readFileSync('server/routes/shared.ts', 'utf-8');

// Update `stepInserts` in `POST /share` (approx line 161)
c = c.replace(/duration_minutes: s\.duration_minutes,\s*order_index: s\.order_index,/g, 
`duration_minutes: s.duration_minutes,
        is_sample_dependent: s.is_sample_dependent ? true : false,
        samples_per_batch: s.samples_per_batch || 1,
        order_index: s.order_index,`);

// Update `stepInserts` in `POST /sync` (approx line 416)
c = c.replace(/duration_minutes: s\.duration_minutes,\s*order_index: s\.order_index,/g, 
`duration_minutes: s.duration_minutes,
          is_sample_dependent: s.is_sample_dependent ? true : false,
          samples_per_batch: s.samples_per_batch || 1,
          order_index: s.order_index,`);

fs.writeFileSync('server/routes/shared.ts', c);
