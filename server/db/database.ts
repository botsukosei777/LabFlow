import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import crypto from 'crypto';

// Derive __dirname safely for both ESM (dev) and CJS (bundled release)
let __bundled_dirname: string;
try {
  __bundled_dirname = path.dirname(fileURLToPath(import.meta.url));
} catch {
  // In CJS bundle, import.meta.url is empty so fileURLToPath throws.
  // Fall back to native CJS __dirname or process.cwd().
  __bundled_dirname = process.cwd();
}

// Resolve paths that work in both dev and release (bundled) mode
const APP_ROOT = process.cwd();
const DB_PATH = path.join(APP_ROOT, 'data', 'labflow.db');

// Schema may be in different locations depending on mode
function findSchemaPath(): string {
  const candidates = [
    path.resolve(__bundled_dirname, 'schema.sql'),                // dev: server/db/schema.sql
    path.join(APP_ROOT, 'server', 'db', 'schema.sql'),   // dev alternative
    path.join(APP_ROOT, 'schema.sql'),                     // release: root/schema.sql
  ];
  for (const p of candidates) {
    if (fs.existsSync(p)) return p;
  }
  throw new Error('schema.sql not found. Searched: ' + candidates.join(', '));
}
const SCHEMA_PATH = findSchemaPath();

// Ensure data directory exists
const dataDir = path.dirname(DB_PATH);
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

let dbInstance = new Database(DB_PATH);

function initDb() {
  // Configure pragmas
  dbInstance.pragma('journal_mode = WAL');
  dbInstance.pragma('synchronous = NORMAL');
  dbInstance.pragma('foreign_keys = ON');

  // Initialize schema
  const schema = fs.readFileSync(SCHEMA_PATH, 'utf-8');
  dbInstance.exec(schema);

  // Migration for new columns (ignores if columns already exist)
  try { dbInstance.exec("ALTER TABLE scheduled_experiments ADD COLUMN start_time TEXT DEFAULT '09:00'"); } catch (e) {}
  try { dbInstance.exec("ALTER TABLE scheduled_blocks ADD COLUMN start_time TEXT DEFAULT '09:00'"); } catch (e) {}
  try { dbInstance.exec("ALTER TABLE scheduled_blocks ADD COLUMN end_time TEXT DEFAULT '10:00'"); } catch (e) {}
  try { dbInstance.exec("ALTER TABLE scheduled_steps ADD COLUMN start_time TEXT DEFAULT '09:00'"); } catch (e) {}
  try { dbInstance.exec("ALTER TABLE scheduled_steps ADD COLUMN end_time TEXT DEFAULT '10:00'"); } catch (e) {}
  try { dbInstance.exec("ALTER TABLE scheduled_steps ADD COLUMN start_date TEXT"); } catch (e) {}
  try { dbInstance.exec("ALTER TABLE scheduled_steps ADD COLUMN end_date TEXT"); } catch (e) {}
  try { dbInstance.exec("ALTER TABLE steps ADD COLUMN is_overnight INTEGER NOT NULL DEFAULT 0"); } catch (e) {}
  try { dbInstance.exec("ALTER TABLE steps ADD COLUMN sub_protocol TEXT DEFAULT ''"); } catch (e) {}
  try { dbInstance.exec("ALTER TABLE scheduled_blocks ADD COLUMN end_date TEXT"); } catch (e) {}
  try { dbInstance.exec("ALTER TABLE notebooks ADD COLUMN file_path TEXT DEFAULT ''"); } catch (e) {}
  try { dbInstance.exec("ALTER TABLE steps ADD COLUMN sub_protocol_id INTEGER REFERENCES sub_protocols(id)"); } catch(e) {}
  try { dbInstance.exec("ALTER TABLE milestone_sub_items ADD COLUMN data_type TEXT NOT NULL DEFAULT 'qualitative'"); } catch(e) {}
  try { dbInstance.exec("ALTER TABLE milestone_sub_items ADD COLUMN target_count INTEGER DEFAULT 1"); } catch(e) {}
  try { dbInstance.exec("ALTER TABLE milestone_sub_items ADD COLUMN current_count INTEGER DEFAULT 0"); } catch(e) {}
  try { dbInstance.exec("ALTER TABLE milestone_items ADD COLUMN unit TEXT DEFAULT ''"); } catch(e) {}
  try { dbInstance.exec("ALTER TABLE milestone_sub_items ADD COLUMN unit TEXT DEFAULT ''"); } catch(e) {}
  try { 
    dbInstance.exec(`
      CREATE TABLE IF NOT EXISTS mini_memos (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          user_id INTEGER NOT NULL,
          message TEXT NOT NULL,
          is_completed INTEGER NOT NULL DEFAULT 0,
          created_at TEXT DEFAULT (datetime('now', 'localtime')),
          updated_at TEXT DEFAULT (datetime('now', 'localtime')),
          FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      )
    `);
  } catch(e) {}
  try { 
    dbInstance.exec(`
      CREATE TABLE IF NOT EXISTS quick_links (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          user_id INTEGER NOT NULL,
          title TEXT NOT NULL,
          url TEXT NOT NULL,
          open_in_app INTEGER NOT NULL DEFAULT 0,
          order_index INTEGER NOT NULL DEFAULT 0,
          created_at TEXT DEFAULT (datetime('now', 'localtime')),
          FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      )
    `);
  } catch(e) {}

  // Sub-protocols migration: make it user-scoped instead of experiment-scoped
  const subProtocolTableInfo = dbInstance.prepare("PRAGMA table_info(sub_protocols)").all() as any[];
  if (subProtocolTableInfo.length > 0) {
    const hasUserId = subProtocolTableInfo.some(col => col.name === 'user_id');
    if (!hasUserId) {
      dbInstance.exec(`
        CREATE TABLE sub_protocols_new (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            name TEXT NOT NULL,
            content TEXT DEFAULT '',
            created_at TEXT DEFAULT (datetime('now', 'localtime')),
            updated_at TEXT DEFAULT (datetime('now', 'localtime')),
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
        );
        INSERT INTO sub_protocols_new (id, user_id, name, content, created_at, updated_at)
        SELECT s.id, e.user_id, s.name, s.content, s.created_at, s.updated_at
        FROM sub_protocols s
        JOIN experiment_types e ON s.experiment_type_id = e.id;
        DROP TABLE sub_protocols;
        ALTER TABLE sub_protocols_new RENAME TO sub_protocols;
      `);
      console.log('[DB] Migrated sub_protocols table to user-scoped');
    }
  } else {
    // Just in case it wasn't created by schema.sql
    dbInstance.exec(`
      CREATE TABLE IF NOT EXISTS sub_protocols (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          user_id INTEGER NOT NULL,
          name TEXT NOT NULL,
          content TEXT DEFAULT '',
          created_at TEXT DEFAULT (datetime('now', 'localtime')),
          updated_at TEXT DEFAULT (datetime('now', 'localtime')),
          FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      )
    `);
  }

  // Add notebooks table
  dbInstance.exec(`
    CREATE TABLE IF NOT EXISTS notebooks (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        title TEXT NOT NULL,
        content TEXT DEFAULT '',
        date TEXT NOT NULL,
        scheduled_experiment_id INTEGER,
        created_at TEXT DEFAULT (datetime('now', 'localtime')),
        updated_at TEXT DEFAULT (datetime('now', 'localtime')),
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
        FOREIGN KEY (scheduled_experiment_id) REFERENCES scheduled_experiments(id) ON DELETE SET NULL
    )
  `);

  // Add start_date and end_date to routine_tasks
  const routineTableInfo = dbInstance.prepare("PRAGMA table_info(routine_tasks)").all() as any[];
  const hasStartDate = routineTableInfo.some(col => col.name === 'start_date');
  if (!hasStartDate) {
    dbInstance.exec(`
      ALTER TABLE routine_tasks ADD COLUMN start_date TEXT;
      ALTER TABLE routine_tasks ADD COLUMN end_date TEXT;
    `);
    console.log('[DB] Added start_date and end_date to routine_tasks table');
  }

  // Ensure default admin user exists
  const adminCheck = dbInstance.prepare('SELECT id FROM users WHERE username = ?').get('admin');
  if (!adminCheck) {
    const salt = crypto.randomBytes(16).toString('hex');
    const hash = crypto.scryptSync('password', salt, 64).toString('hex');
    dbInstance.prepare('INSERT INTO users (username, password_hash) VALUES (?, ?)').run('admin', `${salt}:${hash}`);
    console.log('[DB] Created default admin user (admin/password)');
  }

  console.log('[DB] Database initialized at', DB_PATH);
}

initDb();

const proxyHandler = {
  get(target: any, prop: string | symbol) {
    const val = (dbInstance as any)[prop];
    return typeof val === 'function' ? val.bind(dbInstance) : val;
  }
};
const db = new Proxy({}, proxyHandler) as Database.Database;

// Backup function
export async function backupDatabase(): Promise<string> {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backupPath = path.resolve(dataDir, `labflow-backup-${timestamp}.db`);
  await dbInstance.backup(backupPath);
  console.log('[DB] Backup created at', backupPath);
  return backupPath;
}

// Restore function
export async function restoreDatabase(uploadedFilePath: string): Promise<void> {
  console.log('[DB] Starting restore process from', uploadedFilePath);
  dbInstance.close();
  fs.copyFileSync(uploadedFilePath, DB_PATH);
  dbInstance = new Database(DB_PATH);
  initDb();
  console.log('[DB] Restore completed successfully');
}

export default db;
