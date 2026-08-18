const fs = require('fs');
let c = fs.readFileSync('server/routes/shared.ts', 'utf-8');

c = c.replace(/INSERT INTO steps \(experiment_type_id, pattern_label, name, description, duration_minutes, is_overnight, sub_protocol, sub_protocol_id, order_index, routine_name, routine_duration_days, routine_recurrence, routine_recurrence_days, created_at\)/, 'INSERT INTO steps (experiment_type_id, pattern_label, name, description, duration_minutes, is_sample_dependent, samples_per_batch, is_overnight, sub_protocol, sub_protocol_id, order_index, routine_name, routine_duration_days, routine_recurrence, routine_recurrence_days, created_at)');

c = c.replace(/VALUES \(\?, \?, \?, \?, \?, \?, NULL, \?, \?, \?, \?, \?, \?, CURRENT_TIMESTAMP\)/, 'VALUES (?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)');

c = c.replace(/step\.duration_minutes,\s*step\.is_overnight \? 1 : 0/, 'step.duration_minutes, \n            step.is_sample_dependent ? 1 : 0, step.samples_per_batch || 1, \n            step.is_overnight ? 1 : 0');

fs.writeFileSync('server/routes/shared.ts', c);
