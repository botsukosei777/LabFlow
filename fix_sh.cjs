const fs = require('fs');
let c = fs.readFileSync('server/services/scheduleHelper.ts', 'utf-8');

const selectRegex = /s\.name as step_name,\s*s\.duration_minutes,\s*s\.time_per_sample_minutes,\s*s\.is_overnight,/;
const selectReplacement = `s.name as step_name, s.duration_minutes, s.is_sample_dependent, s.samples_per_batch, s.is_overnight,`;
c = c.replace(selectRegex, selectReplacement);

const effectiveDurationRegex = /let effectiveDuration = step\.duration_minutes \+ \(\(step\.time_per_sample_minutes \|\| 0\) \* \(step\.sample_count \|\| 1\)\);/g;
const effectiveDurationReplacement = `let effectiveDuration = step.is_sample_dependent === 1 ? step.duration_minutes * Math.ceil((step.sample_count || 1) / (step.samples_per_batch || 1)) : step.duration_minutes;`;
c = c.replace(effectiveDurationRegex, effectiveDurationReplacement);

fs.writeFileSync('server/services/scheduleHelper.ts', c);
