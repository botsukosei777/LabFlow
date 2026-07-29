import Database from 'better-sqlite3';
import path from 'path';
import crypto from 'crypto';

const dbPath = path.join(process.cwd(), 'data', 'labflow.db');
const db = new Database(dbPath);

console.log('Starting auth migration...');

// Create users and sessions tables
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      created_at TEXT DEFAULT (datetime('now', 'localtime'))
  );

  CREATE TABLE IF NOT EXISTS sessions (
      token TEXT PRIMARY KEY,
      user_id INTEGER NOT NULL,
      expires_at TEXT NOT NULL,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );
`);

// Insert default admin user
const salt = crypto.randomBytes(16).toString('hex');
const hash = crypto.scryptSync('password', salt, 64).toString('hex');
const password_hash = `${salt}:${hash}`;

const adminUser = db.prepare('SELECT id FROM users WHERE username = ?').get('admin') as { id: number } | undefined;
let adminId = 1;

if (!adminUser) {
  const result = db.prepare('INSERT INTO users (username, password_hash) VALUES (?, ?)').run('admin', password_hash);
  adminId = result.lastInsertRowid as number;
  console.log('Created admin user with id', adminId);
} else {
  adminId = adminUser.id;
  console.log('Admin user already exists with id', adminId);
}

// Function to add user_id column if it doesn't exist
function addUserIdColumn(tableName: string) {
  const columns = db.prepare(`PRAGMA table_info(${tableName})`).all() as { name: string }[];
  if (!columns.some(c => c.name === 'user_id')) {
    db.exec(`ALTER TABLE ${tableName} ADD COLUMN user_id INTEGER DEFAULT ${adminId}`);
    console.log(`Added user_id to ${tableName}`);
  }
}

// Add user_id to main tables
const tablesToAlter = [
  'experiment_types',
  'protocols',
  'scheduled_experiments',
  'milestones',
  'reagents',
  'routine_tasks',
  'holidays'
];

for (const table of tablesToAlter) {
  addUserIdColumn(table);
}

// Recreate settings table for multi-user composite primary key
const settingsCols = db.prepare(`PRAGMA table_info(settings)`).all() as { name: string }[];
if (!settingsCols.some(c => c.name === 'user_id')) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS settings_new (
        key TEXT NOT NULL,
        user_id INTEGER NOT NULL,
        value TEXT NOT NULL,
        PRIMARY KEY (key, user_id),
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );
  `);
  
  // Try migrating data
  try {
    db.exec(`INSERT INTO settings_new (key, user_id, value) SELECT key, ${adminId}, value FROM settings;`);
    db.exec(`DROP TABLE settings;`);
    db.exec(`ALTER TABLE settings_new RENAME TO settings;`);
    console.log('Migrated settings table to support multi-user.');
  } catch (e) {
    console.error('Error migrating settings table', e);
  }
}

// Also update schema.sql file content slightly to reflect this (I will edit it via a separate tool call)

console.log('Migration complete.');
