const fs = require('fs');
let c = fs.readFileSync('src/pages/ExperimentDetail.tsx', 'utf-8');

// Replace state initializations
c = c.replace(/setStepForm\(\{\s*name:\s*'',\s*description:\s*'',\s*duration_minutes:\s*0,\s*is_overnight:/g, "setStepForm({ name: '', description: '', duration_minutes: 0, time_per_sample_minutes: 0, is_overnight:");

// Replace step edit loading
c = c.replace(/duration_minutes:\s*step\.duration_minutes,\s*is_overnight:/g, "duration_minutes: step.duration_minutes, time_per_sample_minutes: step.time_per_sample_minutes || 0, is_overnight:");

// Add an input field for time_per_sample_minutes below the duration_minutes input
const durationInputRegex = /(<input\s+className="form-input"\s+type="number"\s+min="0"\s+value=\{stepForm\.duration_minutes\}\s+onChange=\{e => setStepForm\(\{ \.\.\.stepForm,\s*duration_minutes:\s*parseInt\(e\.target\.value\)\s*\|\|\s*0 \}\)\}\s*disabled=\{stepForm\.is_overnight\}\s*\/>)/;

c = c.replace(durationInputRegex, `$1\n                  <label className="form-label mt-2">サンプル1個あたりの追加時間 (分)</label>\n                  <input className="form-input" type="number" min="0" value={stepForm.time_per_sample_minutes} onChange={e => setStepForm({ ...stepForm, time_per_sample_minutes: parseInt(e.target.value) || 0 })} disabled={stepForm.is_overnight} />`);

fs.writeFileSync('src/pages/ExperimentDetail.tsx', c);
