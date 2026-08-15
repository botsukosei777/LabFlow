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

// Helper: read current version from VERSION file or package.json
function getCurrentVersion(): string {
  // First, try VERSION file in cwd (release environment)
  const versionFilePath = path.join(process.cwd(), 'VERSION');
  if (fs.existsSync(versionFilePath)) {
    return fs.readFileSync(versionFilePath, 'utf-8').trim();
  }
  // Fall back to package.json
  const pkgPath = path.join(process.cwd(), 'package.json');
  if (fs.existsSync(pkgPath)) {
    try {
      const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
      return pkg.version || '0.0.0';
    } catch { /* ignore */ }
  }
  return '0.0.0';
}

// Update Check API
router.get('/update/check', async (req, res) => {
  try {
    const REPO = 'botsukosei777/LabFlow';
    const CURRENT_VERSION = getCurrentVersion();

    const response = await fetch(`https://api.github.com/repos/${REPO}/releases/latest`, {
      headers: { 'Accept': 'application/vnd.github.v3+json', 'User-Agent': 'LabFlow-Updater' }
    });

    if (!response.ok) {
      // No releases yet or API error
      return res.json({
        update_available: false,
        current_version: CURRENT_VERSION,
        latest_version: CURRENT_VERSION,
        release_notes: '',
        download_url: ''
      });
    }

    const release = await response.json() as any;
    const latestVersion = (release.tag_name || '').replace(/^v/, '');
    
    // Find the ZIP asset
    const asset = release.assets?.find((a: any) => a.name.endsWith('.zip'));
    const downloadUrl = asset?.browser_download_url || '';

    // Simple version comparison (works for semver like 1.0.0 < 1.1.0)
    const isNewer = latestVersion.localeCompare(CURRENT_VERSION, undefined, { numeric: true, sensitivity: 'base' }) > 0;

    res.json({
      update_available: isNewer,
      current_version: CURRENT_VERSION,
      latest_version: latestVersion || CURRENT_VERSION,
      release_notes: release.body || '',
      download_url: downloadUrl
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
  // IMPORTANT: We build the batch file from an array of lines joined with \r\n.
  // This avoids issues where:
  //   - JS template literals produce LF-only newlines
  //   - esbuild double-escapes regex patterns, breaking .replace() fixes
  //   - cmd.exe with chcp 65001 misreads LF-only files containing multibyte UTF-8,
  //     causing byte-offset misalignment and garbled commands
  const batPath = path.join(process.cwd(), 'update.bat');
  const batLines = [
    '@echo off',
    'chcp 65001 > nul',
    'echo =======================================',
    'echo   LabFlow Updater',
    'echo.',
    'echo   Backing up data...',
    'if exist "data" (',
    '  xcopy /E /I /Y "data" "data_backup" > nul 2>&1',
    ')',
    '',
    'echo.',
    'echo   Downloading new version...',
    'powershell -Command "[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12; Invoke-WebRequest -Uri \'' + download_url + '\' -OutFile \'update.zip\'"',
    'if errorlevel 1 (',
    '  echo   Download failed.',
    '  if exist "data_backup" (',
    '    xcopy /E /I /Y "data_backup" "data" > nul 2>&1',
    '    rmdir /S /Q "data_backup" > nul 2>&1',
    '  )',
    '  pause',
    '  exit /b 1',
    ')',
    '',
    'echo.',
    'echo   Extracting...',
    'if exist "update_temp" rmdir /S /Q "update_temp" > nul 2>&1',
    'powershell -Command "Expand-Archive -Path \'update.zip\' -DestinationPath \'update_temp\' -Force"',
    '',
    'REM Detect extracted structure: flat or nested in a single subfolder',
    'set "UPDATE_SRC=update_temp"',
    'if not exist "update_temp\\start.bat" (',
    '  if not exist "update_temp\\server.cjs" (',
    '    for /d %%D in (update_temp\\*) do (',
    '      if exist "%%D\\start.bat" set "UPDATE_SRC=%%D"',
    '      if exist "%%D\\server.cjs" set "UPDATE_SRC=%%D"',
    '    )',
    '  )',
    ')',
    '',
    'echo.',
    'echo   Stopping server...',
    'taskkill /F /IM node.exe /FI "WINDOWTITLE eq LabFlow*" > nul 2>&1',
    'timeout /t 2 /nobreak > nul',
    'for /f "tokens=5" %%a in (\'netstat -aon ^| findstr :3001 ^| findstr LISTENING 2^>nul\') do (',
    '  taskkill /F /PID %%a > nul 2>&1',
    ')',
    'timeout /t 2 /nobreak > nul',
    '',
    'echo.',
    'echo   Updating files...',
    'xcopy /E /Y "%UPDATE_SRC%\\*" "." /EXCLUDE:update_exclude.txt > nul 2>&1',
    'if errorlevel 1 (',
    '  xcopy /E /Y "%UPDATE_SRC%\\*" "." > nul 2>&1',
    ')',
    '',
    'echo.',
    'echo   Restoring data...',
    'if exist "data_backup" (',
    '  xcopy /E /I /Y "data_backup" "data" > nul 2>&1',
    '  rmdir /S /Q "data_backup" > nul 2>&1',
    ')',
    '',
    'echo.',
    'echo   Cleaning up...',
    'del update.zip > nul 2>&1',
    'rmdir /S /Q "update_temp" > nul 2>&1',
    '',
    'echo.',
    'echo   Update complete! Restarting LabFlow...',
    'timeout /t 3 > nul',
    'del "%~f0"',
  ];
  const batContent = batLines.join('\r\n') + '\r\n';

  try {
    // Write as binary buffer to prevent any encoding layer from altering line endings
    fs.writeFileSync(batPath, Buffer.from(batContent, 'utf-8'));
    
    // 2. Respond to client first
    res.json({ message: 'Update started. The server will restart shortly.' });
    
    // 3. Spawn the bat file detached (in a NEW console window)
    const child = spawn('cmd.exe', ['/c', 'start', '"LabFlow Updater"', 'cmd.exe', '/c', 'update.bat'], {
      detached: true,
      stdio: 'ignore',
      cwd: process.cwd(),
      shell: true
    });
    child.unref();
    
    // 4. Exit this process to release file locks and port
    setTimeout(() => {
      process.exit(0);
    }, 1500);
    
  } catch (err: any) {
    res.status(500).json({ message: 'Failed to start updater: ' + err.message });
  }
});

export default router;
