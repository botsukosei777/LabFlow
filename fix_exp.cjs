const fs = require('fs');
let c = fs.readFileSync('server/routes/experiments.ts', 'utf-8');

// Update INSERT
const insertRegex = /INSERT INTO steps \(experiment_type_id, name, description, duration_minutes, time_per_sample_minutes, is_overnight, pattern_label, order_index, sub_protocol_id, routine_name, routine_duration_days, routine_recurrence, routine_recurrence_days\) VALUES \(\?, \?, \?, \?, \?, \?, \?, \?, \?, \?, \?, \?, \?\)/;
const insertReplacement = `INSERT INTO steps (experiment_type_id, name, description, duration_minutes, time_per_sample_minutes, is_sample_dependent, samples_per_batch, is_overnight, pattern_label, order_index, sub_protocol_id, routine_name, routine_duration_days, routine_recurrence, routine_recurrence_days) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;
c = c.replace(insertRegex, insertReplacement);

// Update INSERT args
const insertArgsRegex = /\.run\(req\.params\.id, name, description \|\| '', duration_minutes \|\| 0, req\.body\.time_per_sample_minutes \|\| 0, is_overnight \? 1 : 0, pattern_label \|\| 'default'/;
const insertArgsReplacement = `.run(req.params.id, name, description || '', duration_minutes || 0, req.body.time_per_sample_minutes || 0, req.body.is_sample_dependent ? 1 : 0, req.body.samples_per_batch || 1, is_overnight ? 1 : 0, pattern_label || 'default'`;
c = c.replace(insertArgsRegex, insertArgsReplacement);

// Update UPDATE
const updateRegex = /UPDATE steps SET name = \?, description = \?, duration_minutes = \?, time_per_sample_minutes = \?, is_overnight = \?, pattern_label = \?, sub_protocol_id = \?, routine_name = \?, routine_duration_days = \?, routine_recurrence = \?, routine_recurrence_days = \? WHERE id = \?/;
const updateReplacement = `UPDATE steps SET name = ?, description = ?, duration_minutes = ?, time_per_sample_minutes = ?, is_sample_dependent = ?, samples_per_batch = ?, is_overnight = ?, pattern_label = ?, sub_protocol_id = ?, routine_name = ?, routine_duration_days = ?, routine_recurrence = ?, routine_recurrence_days = ? WHERE id = ?`;
c = c.replace(updateRegex, updateReplacement);

// Update UPDATE args
const updateArgsRegex = /\.run\(name, description \|\| '', duration_minutes \|\| 0, req\.body\.time_per_sample_minutes \|\| 0, is_overnight \? 1 : 0, pattern_label \|\| 'default', sub_protocol_id \|\| null, routine_name \|\| null, routine_duration_days \|\| null, routine_recurrence \|\| null, routine_recurrence_days \|\| null, req\.params\.stepId\);/;
const updateArgsReplacement = `.run(name, description || '', duration_minutes || 0, req.body.time_per_sample_minutes || 0, req.body.is_sample_dependent ? 1 : 0, req.body.samples_per_batch || 1, is_overnight ? 1 : 0, pattern_label || 'default', sub_protocol_id || null, routine_name || null, routine_duration_days || null, routine_recurrence || null, routine_recurrence_days || null, req.params.stepId);`;
c = c.replace(updateArgsRegex, updateArgsReplacement);

fs.writeFileSync('server/routes/experiments.ts', c);
