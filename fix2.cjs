const fs = require('fs');
let c = fs.readFileSync('src/pages/Calendar.tsx', 'utf-8');

c = c.replace(/const \[scheduleForm, setScheduleForm\] = useState\(\{/, "const [scheduleForm, setScheduleForm] = useState({\n    sample_count: 1,");
c = c.replace(/setScheduleForm\(\{ \.\.\.scheduleForm, protocol_id: '', label: '', notes: '', color: '#3B82F6' \}\);/, "setScheduleForm({ ...scheduleForm, protocol_id: '', label: '', notes: '', color: '#3B82F6', sample_count: 1 });");

const postCallRegex = /await api\.post\('\/schedule',\s*\{\s*protocol_id:\s*scheduleForm\.protocol_id,\s*start_date:\s*scheduleForm\.start_date,\s*block_start_times:\s*scheduleForm\.block_start_times,\s*mode:\s*scheduleForm\.mode,\s*label:\s*scheduleForm\.label,\s*notes:\s*scheduleForm\.notes,\s*color:\s*scheduleForm\.color\s*\}\);/;

c = c.replace(postCallRegex, `await api.post('/schedule', {\n        protocol_id: scheduleForm.protocol_id,\n        start_date: scheduleForm.start_date,\n        block_start_times: scheduleForm.block_start_times,\n        mode: scheduleForm.mode,\n        label: scheduleForm.label,\n        notes: scheduleForm.notes,\n        color: scheduleForm.color,\n        sample_count: scheduleForm.sample_count\n      });`);

const labelInputRegex = /(<input\s*type="text"\s*className="form-input"\s*value=\{scheduleForm\.label\}\s*onChange=\{\(e\) => setScheduleForm\(\{\.\.\.scheduleForm, label: e\.target\.value\}\)\}\s*placeholder="例：〇〇実験 第1回"\s*\/>)/;

c = c.replace(labelInputRegex, `$1\n                </div>\n                \n                <div className="form-group">\n                  <label className="form-label">サンプル数</label>\n                  <input type="number" min="1" className="form-input" value={scheduleForm.sample_count} onChange={(e) => setScheduleForm({...scheduleForm, sample_count: parseInt(e.target.value) || 1})} />`);

fs.writeFileSync('src/pages/Calendar.tsx', c);
