import express from 'express';
import cors from 'cors';
import path from 'path';
import fs from 'fs';
import { exec } from 'child_process';
import db from './db/database.js';
import { backupDatabase } from './db/database.js';
import { startScheduler } from './services/scheduler.js';
import experimentRoutes from './routes/experiments.js';
import scheduleRoutes from './routes/schedule.js';
import milestoneRoutes from './routes/milestones.js';
import reagentRoutes from './routes/reagents.js';
import routineRoutes from './routes/routines.js';
import settingsRoutes from './routes/settings.js';
import eventRoutes from './routes/events.js';
import notebookRoutes from './routes/notebook.js';
import miniMemosRoutes from './routes/miniMemos.js';
import quickLinksRoutes from './routes/quickLinks.js';

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware - allow both dev (Vite proxy) and production (same-origin) access
app.use(cors());
app.use(express.json());

import { requireAuth } from './middleware/auth.js';
import authRoutes from './routes/auth.js';

import subProtocolRoutes from './routes/sub_protocols.js';

// API Routes
app.use('/api/auth', authRoutes);

// Protected API Routes
app.use('/api/experiments', requireAuth, experimentRoutes);
app.use('/api/sub_protocols', requireAuth, subProtocolRoutes);
app.use('/api/schedule', requireAuth, scheduleRoutes);
app.use('/api/milestones', requireAuth, milestoneRoutes);
app.use('/api/reagents', requireAuth, reagentRoutes);
app.use('/api/routines', requireAuth, routineRoutes);
app.use('/api/settings', requireAuth, settingsRoutes);
app.use('/api/events', requireAuth, eventRoutes);
app.use('/api/notebook', requireAuth, notebookRoutes);
app.use('/api/mini_memos', requireAuth, miniMemosRoutes);
app.use('/api/quick_links', requireAuth, quickLinksRoutes);

// Backup endpoint
app.get('/api/backup', requireAuth, async (req, res) => {
  try {
    const backupPath = await backupDatabase();
    
    // Read the file synchronously to ensure it's fully loaded
    const fileBuffer = fs.readFileSync(backupPath);
    
    res.setHeader('Content-Type', 'application/octet-stream');
    res.setHeader('Content-Disposition', `attachment; filename="labflow-backup-${new Date().toISOString().split('T')[0]}.db"`);
    res.send(fileBuffer);
    
    // Clean up backup file after download
    if (fs.existsSync(backupPath)) {
      fs.unlinkSync(backupPath);
    }
  } catch (error) {
    console.error('[Backup] Error:', error);
    res.status(500).json({ message: 'Backup failed' });
  }
});

import multer from 'multer';
import { restoreDatabase } from './db/database.js';

const upload = multer({ dest: 'data/temp_uploads/' });

// Restore endpoint
app.post('/api/restore', requireAuth, upload.single('backupFile'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ message: 'No file uploaded' });
    }
    
    await restoreDatabase(req.file.path);
    
    // Clean up the uploaded temp file
    if (fs.existsSync(req.file.path)) {
      fs.unlinkSync(req.file.path);
    }
    
    res.json({ message: 'Restore completed successfully' });
  } catch (error) {
    console.error('[Restore] Error:', error);
    res.status(500).json({ message: 'Restore failed' });
  }
});

// Serve static files in production (use process.cwd() for portability)
const distPath = path.join(process.cwd(), 'dist');
if (fs.existsSync(distPath)) {
  app.use(express.static(distPath));
  app.use((req, res) => {
    res.sendFile(path.join(distPath, 'index.html'));
  });
}

// Start server
app.listen(PORT, () => {
  console.log(`\n  ┌───────────────────────────────────┐`);
  console.log(`  │  🧪 LabFlow Server                  │`);
  console.log(`  │  Running on http://localhost:${PORT}  │`);
  console.log(`  └───────────────────────────────────┘\n`);

  // Auto-open browser when running in production / release mode
  if (process.env.LABFLOW_AUTO_OPEN === '1') {
    const url = `http://localhost:${PORT}`;
    // Windows: start, macOS: open, Linux: xdg-open
    const cmd = process.platform === 'win32' ? `start ${url}`
              : process.platform === 'darwin' ? `open ${url}`
              : `xdg-open ${url}`;
    exec(cmd, (err) => {
      if (err) console.log(`[Server] ブラウザを自動で開けませんでした。手動で ${url} にアクセスしてください。`);
    });
  }
});

// Start scheduled tasks
startScheduler();

