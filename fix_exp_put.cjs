const fs = require('fs');
let c = fs.readFileSync('server/routes/experiments.ts', 'utf-8');

c = c.replace(/'UPDATE steps SET name = \?, description = \?, duration_minutes = \?, time_per_sample_minutes = \?, is_overnight = \?, pattern_label = \?, order_index = \?, sub_protocol_id = \?, routine_name = \?, routine_duration_days = \?, routine_recurrence = \?, routine_recurrence_days = \? WHERE id = \?'/, "'UPDATE steps SET name = ?, description = ?, duration_minutes = ?, is_sample_dependent = ?, samples_per_batch = ?, is_overnight = ?, pattern_label = ?, order_index = ?, sub_protocol_id = ?, routine_name = ?, routine_duration_days = ?, routine_recurrence = ?, routine_recurrence_days = ? WHERE id = ?'");

c = c.replace(/\)\.run\(name, description, duration_minutes, time_per_sample_minutes \|\| 0, is_overnight \? 1 : 0, pattern_label, order_index, sub_protocol_id \|\| null, routine_name \|\| null, routine_duration_days \|\| null, routine_recurrence \|\| null, routine_recurrence_days \|\| null, req\.params\.stepId\);/, ").run(name, description, duration_minutes, req.body.is_sample_dependent ? 1 : 0, req.body.samples_per_batch || 1, is_overnight ? 1 : 0, pattern_label, order_index, sub_protocol_id || null, routine_name || null, routine_duration_days || null, routine_recurrence || null, routine_recurrence_days || null, req.params.stepId);");

fs.writeFileSync('server/routes/experiments.ts', c);
