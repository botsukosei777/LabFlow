const fs = require('fs');
let c = fs.readFileSync('server/db/database.ts', 'utf-8');

c = c.replace(/time_per_sample_minutes INTEGER NOT NULL DEFAULT 0"\);\s*\}\s*catch\(e\)\s*\{\}/, 'time_per_sample_minutes INTEGER NOT NULL DEFAULT 0"); } catch(e) {}\n  try { dbInstance.exec("ALTER TABLE steps ADD COLUMN is_sample_dependent INTEGER NOT NULL DEFAULT 0"); } catch(e) {}\n  try { dbInstance.exec("ALTER TABLE steps ADD COLUMN samples_per_batch INTEGER NOT NULL DEFAULT 1"); } catch(e) {}');

fs.writeFileSync('server/db/database.ts', c);
