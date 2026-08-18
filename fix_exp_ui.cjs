const fs = require('fs');
let c = fs.readFileSync('src/pages/ExperimentDetail.tsx', 'utf-8');

// Replace state field
c = c.replace(/time_per_sample_minutes: 0/g, 'is_sample_dependent: false, samples_per_batch: 1');

// Replace setting from existing step
c = c.replace(/time_per_sample_minutes: step\.time_per_sample_minutes \|\| 0/g, 'is_sample_dependent: !!step.is_sample_dependent, samples_per_batch: step.samples_per_batch || 1');

// Remove old input
const oldInputRegex = /<label className="form-label mt-2">サンプル1個あたりの追加時間 \(分\)<\/label>\s*<input className="form-input" type="number" min="0" value=\{stepForm\.time_per_sample_minutes\} onChange=\{e => setStepForm\(\{ \.\.\.stepForm, time_per_sample_minutes: parseInt\(e\.target\.value\) \|\| 0 \}\)\} disabled=\{stepForm\.is_overnight\} \/>/;

const newInput = `<label className="form-label mt-2" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <input type="checkbox" checked={stepForm.is_sample_dependent} onChange={e => setStepForm({ ...stepForm, is_sample_dependent: e.target.checked })} />
                    サンプル数依存にする
                  </label>
                  {stepForm.is_sample_dependent && (
                    <div style={{ display: 'flex', gap: '8px', alignItems: 'center', marginTop: '8px' }}>
                      <input className="form-input" type="number" min="1" value={stepForm.samples_per_batch} onChange={e => setStepForm({ ...stepForm, samples_per_batch: parseInt(e.target.value) || 1 })} style={{ width: '80px' }} />
                      <span>サンプルごとに所要時間を加算</span>
                    </div>
                  )}`;

c = c.replace(oldInputRegex, newInput);

fs.writeFileSync('src/pages/ExperimentDetail.tsx', c);
