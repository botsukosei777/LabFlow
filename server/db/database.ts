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
  try { dbInstance.exec("ALTER TABLE scheduled_experiments ADD COLUMN color TEXT"); } catch (e) {}
  
  // Supabase integration columns
  try { dbInstance.exec("ALTER TABLE users ADD COLUMN supabase_user_id TEXT"); } catch (e) {}
  try { dbInstance.exec("ALTER TABLE users ADD COLUMN supabase_email TEXT"); } catch (e) {}

  // Migration for routine automated generation fields
  try { dbInstance.exec("ALTER TABLE steps ADD COLUMN routine_name TEXT"); } catch (e) {}
  try { dbInstance.exec("ALTER TABLE steps ADD COLUMN routine_duration_days INTEGER"); } catch (e) {}
  try { dbInstance.exec("ALTER TABLE steps ADD COLUMN routine_recurrence TEXT"); } catch (e) {}
  try { dbInstance.exec("ALTER TABLE steps ADD COLUMN routine_recurrence_days TEXT"); } catch (e) {}
  try { dbInstance.exec("ALTER TABLE steps ADD COLUMN is_overnight INTEGER NOT NULL DEFAULT 0"); } catch (e) {}
  try { dbInstance.exec("ALTER TABLE steps ADD COLUMN sub_protocol TEXT DEFAULT ''"); } catch (e) {}
  try { dbInstance.exec("ALTER TABLE scheduled_blocks ADD COLUMN end_date TEXT"); } catch (e) {}
  try { dbInstance.exec("ALTER TABLE notebooks ADD COLUMN file_path TEXT DEFAULT ''"); } catch (e) {}
  try { dbInstance.exec("ALTER TABLE steps ADD COLUMN sub_protocol_id INTEGER REFERENCES sub_protocols(id)"); } catch(e) {}
  try { dbInstance.exec("ALTER TABLE milestone_sub_items ADD COLUMN data_type TEXT NOT NULL DEFAULT 'qualitative'"); } catch(e) {}
  try { dbInstance.exec("ALTER TABLE milestone_sub_items ADD COLUMN target_count INTEGER DEFAULT 1"); } catch(e) {}
  try { dbInstance.exec("ALTER TABLE milestone_sub_items ADD COLUMN current_count INTEGER DEFAULT 0"); } catch(e) {}
  try { dbInstance.exec("ALTER TABLE milestone_items ADD COLUMN unit TEXT DEFAULT ''"); } catch(e) {}
  try { dbInstance.exec("ALTER TABLE milestone_items ADD COLUMN updated_at TEXT"); } catch(e) {}
  try { dbInstance.exec("ALTER TABLE milestone_sub_items ADD COLUMN updated_at TEXT"); } catch(e) {}
  try { dbInstance.exec("ALTER TABLE shared_reagents ADD COLUMN original_local_id INTEGER"); } catch(e) {} // Not needed locally but maybe keep it clean
  try { dbInstance.exec("ALTER TABLE reagents ADD COLUMN shared_id TEXT"); } catch(e) {}  
  try { dbInstance.exec("ALTER TABLE reagents ADD COLUMN location TEXT DEFAULT ''"); } catch(e) {}
  // Migration for branched parallel steps
  try { dbInstance.exec("ALTER TABLE block_steps ADD COLUMN branch_index INTEGER NOT NULL DEFAULT 0"); } catch(e) {}
  try { dbInstance.exec("ALTER TABLE milestone_sub_items ADD COLUMN unit TEXT DEFAULT ''"); } catch(e) {}
  try { dbInstance.exec("ALTER TABLE steps ADD COLUMN time_per_sample_minutes INTEGER NOT NULL DEFAULT 0"); } catch(e) {}
  try { dbInstance.exec("ALTER TABLE steps ADD COLUMN is_sample_dependent INTEGER NOT NULL DEFAULT 0"); } catch(e) {}
  try { dbInstance.exec("ALTER TABLE steps ADD COLUMN samples_per_batch INTEGER NOT NULL DEFAULT 1"); } catch(e) {}
  try { dbInstance.exec("ALTER TABLE steps ADD COLUMN extra_duration_minutes REAL NOT NULL DEFAULT 0"); } catch(e) {}
  try { dbInstance.exec("ALTER TABLE scheduled_experiments ADD COLUMN sample_count INTEGER NOT NULL DEFAULT 1"); } catch(e) {}
  try { dbInstance.exec("ALTER TABLE events ADD COLUMN end_date TEXT"); } catch(e) {}
  try { dbInstance.exec("ALTER TABLE events ADD COLUMN is_all_day INTEGER NOT NULL DEFAULT 0"); } catch(e) {}
  
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
  
  // Make poll_votes user_id nullable if it isn't
  try {
    const tableInfo = dbInstance.prepare("PRAGMA table_info(poll_votes)").all() as any[];
    const userCol = tableInfo.find(c => c.name === 'user_id');
    if (userCol && userCol.notnull === 1) {
      dbInstance.transaction(() => {
        dbInstance.exec(`
          CREATE TABLE poll_votes_new (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              poll_id INTEGER NOT NULL,
              user_id INTEGER,
              voter_name TEXT NOT NULL,
              answers TEXT DEFAULT '{}',
              created_at TEXT DEFAULT (datetime('now', 'localtime')),
              updated_at TEXT DEFAULT (datetime('now', 'localtime')),
              FOREIGN KEY (poll_id) REFERENCES polls(id) ON DELETE CASCADE,
              FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
              UNIQUE(poll_id, user_id)
          );
          INSERT INTO poll_votes_new SELECT * FROM poll_votes;
          DROP TABLE poll_votes;
          ALTER TABLE poll_votes_new RENAME TO poll_votes;
        `);
      })();
    }
  } catch (e) {
    console.error("Migration error for poll_votes nullable user_id:", e);
  }

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

  try { 
    dbInstance.exec(`
      CREATE TABLE IF NOT EXISTS literature (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          user_id INTEGER NOT NULL,
          title TEXT NOT NULL,
          authors TEXT DEFAULT '',
          lab_name TEXT DEFAULT '',
          journal TEXT DEFAULT '',
          volume TEXT DEFAULT '',
          issue TEXT DEFAULT '',
          pages TEXT DEFAULT '',
          year INTEGER,
          doi TEXT DEFAULT '',
          paper_type TEXT DEFAULT 'original',
          project_name TEXT DEFAULT '',
          abstract TEXT DEFAULT '',
          notes TEXT DEFAULT '',
          keywords TEXT DEFAULT '[]',
          read_abstract INTEGER NOT NULL DEFAULT 0,
          read_body INTEGER NOT NULL DEFAULT 0,
          pdf_filename TEXT DEFAULT '',
          pdf_path TEXT DEFAULT '',
          supplemental_filename TEXT DEFAULT '',
          supplemental_path TEXT DEFAULT '',
          created_at TEXT DEFAULT (datetime('now', 'localtime')),
          updated_at TEXT DEFAULT (datetime('now', 'localtime')),
          FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      );
      CREATE INDEX IF NOT EXISTS idx_literature_user_id ON literature(user_id);
      CREATE INDEX IF NOT EXISTS idx_literature_project ON literature(project_name);
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
