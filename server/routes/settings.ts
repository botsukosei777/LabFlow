import { Router } from 'express';
import db from '../db/database.js';

const router = Router();

// SMTP Presets
const SMTP_PRESETS: Record<string, { host: string; port: string; secure: string }> = {
  gmail: { host: 'smtp.gmail.com', port: '587', secure: 'false' },
  outlook: { host: 'smtp-mail.outlook.com', port: '587', secure: 'false' },
  university: { host: '', port: '587', secure: 'false' },
  custom: { host: '', port: '587', secure: 'false' },
};

// GET all settings
router.get('/', (req, res) => {
  const rows = db.prepare('SELECT * FROM settings WHERE user_id = ?').all(req.userId) as any[];
  const settings: Record<string, string> = {};
  for (const row of rows) {
    settings[row.key] = row.value;
  }
  res.json(settings);
});

// PUT update settings
router.put('/', (req, res) => {
  const settings = req.body;
  const upsert = db.prepare(
    'INSERT INTO settings (key, user_id, value) VALUES (?, ?, ?) ON CONFLICT(key, user_id) DO UPDATE SET value = excluded.value'
  );
  
  const update = db.transaction((data: Record<string, string>, userId: number) => {
    for (const [key, value] of Object.entries(data)) {
      upsert.run(key, userId, String(value));
    }
    
    // Apply SMTP preset if changed
    if (data.smtp_preset && SMTP_PRESETS[data.smtp_preset]) {
      const preset = SMTP_PRESETS[data.smtp_preset];
      if (data.smtp_preset !== 'custom' && data.smtp_preset !== 'university') {
        upsert.run('smtp_host', userId, preset.host);
        upsert.run('smtp_port', userId, preset.port);
        upsert.run('smtp_secure', userId, preset.secure);
      }
    }
  });
  
  update(settings, req.userId as number);
  
  // Return updated settings
  const rows = db.prepare('SELECT * FROM settings WHERE user_id = ?').all(req.userId) as any[];
  const result: Record<string, string> = {};
  for (const row of rows) {
    result[row.key] = row.value;
  }
  res.json(result);
});

// GET holidays
router.get('/holidays', (req, res) => {
  const holidays = db.prepare('SELECT * FROM holidays WHERE user_id = ? ORDER BY date').all(req.userId);
  res.json(holidays);
});

// POST add holiday
router.post('/holidays', (req, res) => {
  const { date, label, recurring } = req.body;
  if (!date) return res.status(400).json({ message: 'Date is required' });
  
  try {
    const result = db.prepare(
      'INSERT INTO holidays (user_id, date, label, recurring) VALUES (?, ?, ?, ?)'
    ).run(req.userId, date, label || '', recurring ? 1 : 0);
    const created = db.prepare('SELECT * FROM holidays WHERE id = ? AND user_id = ?').get(result.lastInsertRowid, req.userId);
    res.status(201).json(created);
  } catch (e) {
    res.status(409).json({ message: 'Holiday already exists for this date' });
  }
});

// DELETE holiday
router.delete('/holidays/:id', (req, res) => {
  db.prepare('DELETE FROM holidays WHERE id = ? AND user_id = ?').run(req.params.id, req.userId);
  res.status(204).send();
});

// DELETE holiday by date
router.delete('/holidays/date/:date', (req, res) => {
  db.prepare('DELETE FROM holidays WHERE date = ? AND user_id = ?').run(req.params.date, req.userId);
  res.status(204).send();
});

// Update Check API
router.get('/update/check', async (req, res) => {
  try {
    // 実際には設定からリポジトリ名を引くか、固定のURLにする。
    // 今回は例として固定のGitHubリポジトリ（ここではプレースホルダー）
    const REPO = 'username/labflow'; // TODO: Update to real repo if available
    
    // As a mock for demonstration without a real public repo, we'll return no update
    // In reality, you'd do: fetch(`https://api.github.com/repos/${REPO}/releases/latest`)
    res.json({
      update_available: false,
      latest_version: '1.0.0',
      release_notes: '',
      download_url: ''
    });
  } catch (err: any) {
    res.status(500).json({ message: err.message });
  }
});

import { spawn } from 'child_process';
import path from 'path';
import fs from 'fs';

// Update Apply API
router.post('/update/apply', (req, res) => {
  const { download_url } = req.body;
  if (!download_url) return res.status(400).json({ message: 'Missing download_url' });

  // 1. Create update.bat
  const batPath = path.join(process.cwd(), 'update.bat');
  const batContent = `
@echo off
echo =======================================
echo LabFlow Updater
echo =======================================
echo サーバーの終了を待機しています...
timeout /t 3 /nobreak > nul

echo.
echo 新しいバージョンをダウンロードしています...
powershell -Command "Invoke-WebRequest -Uri '${download_url}' -OutFile 'update.zip'"

echo.
echo 展開しています...
powershell -Command "Expand-Archive -Path 'update.zip' -DestinationPath '.' -Force"

echo.
echo クリーンアップしています...
del update.zip

echo.
echo LabFlowを再起動します...
start start.bat

echo アップデート完了。このウィンドウは自動的に閉じます。
timeout /t 3 > nul
del "%~f0"
`;

  try {
    fs.writeFileSync(batPath, batContent.trim(), 'utf-8');
    
    // 2. Respond to client first
    res.json({ message: 'Update started. The server will restart shortly.' });
    
    // 3. Spawn the bat file detached
    const child = spawn('cmd.exe', ['/c', 'update.bat'], {
      detached: true,
      stdio: 'ignore',
      cwd: process.cwd()
    });
    child.unref();
    
    // 4. Exit this process to release file locks
    setTimeout(() => {
      process.exit(0);
    }, 1000);
    
  } catch (err: any) {
    res.status(500).json({ message: 'Failed to start updater: ' + err.message });
  }
});

export default router;
