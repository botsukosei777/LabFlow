const fs = require('fs');
let c = fs.readFileSync('src/pages/Calendar.tsx', 'utf-8');

c = c.replace(/<div className="form-group">\s*<label className="form-label">サンプル数<\/label>\s*<input type="number" min="1" className="form-input" value=\{scheduleForm\.sample_count\} onChange=\{\(e\) => setScheduleForm\(\{\.\.\.scheduleForm, sample_count: parseInt\(e\.target\.value\) \|\| 1\}\)\} \/>/, `{selectedProtocol?.has_sample_dependent_steps && (
                  <div className="form-group">
                    <label className="form-label">サンプル数</label>
                    <input type="number" min="1" className="form-input" value={scheduleForm.sample_count} onChange={(e) => setScheduleForm({...scheduleForm, sample_count: parseInt(e.target.value) || 1})} />
                  </div>
                )}`);

fs.writeFileSync('src/pages/Calendar.tsx', c);
