const fs = require('fs');
let c = fs.readFileSync('server/routes/shared.ts', 'utf-8');

const regex1 = /INSERT INTO steps \(experiment_type_id, pattern_label, name, description, duration_minutes, is_overnight, sub_protocol, sub_protocol_id, order_index, routine_name, routine_duration_days, routine_recurrence, routine_recurrence_days, created_at\)\s*VALUES \(\?, \?, \?, \?, \?, \?, \?, \?, \?, \?, \?, \?, \?, \?\)/;
const replacement1 = `INSERT INTO steps (experiment_type_id, pattern_label, name, description, duration_minutes, time_per_sample_minutes, is_overnight, sub_protocol, sub_protocol_id, order_index, routine_name, routine_duration_days, routine_recurrence, routine_recurrence_days, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;
            
c = c.replace(regex1, replacement1);

const regex2 = /s\.duration_minutes,\s*s\.is_overnight/;
const replacement2 = `s.duration_minutes,
            s.time_per_sample_minutes || 0,
            s.is_overnight`;
            
c = c.replace(regex2, replacement2);

fs.writeFileSync('server/routes/shared.ts', c);
