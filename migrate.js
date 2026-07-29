import Database from 'better-sqlite3';
import path from 'path';

const dbPath = path.resolve(process.cwd(), 'data', 'labflow.sqlite');
const db = new Database(dbPath);

console.log('Running migration...');

try {
  // Add sub_protocol to steps
  db.exec(`ALTER TABLE steps ADD COLUMN sub_protocol TEXT DEFAULT '';`);
} catch (e) {
  console.log('sub_protocol column may already exist or error:', e.message);
}

try {
  // Add end_date to scheduled_blocks
  db.exec(`ALTER TABLE scheduled_blocks ADD COLUMN end_date TEXT;`);
} catch (e) {
  console.log('end_date column may already exist or error:', e.message);
}

// Create new tables
db.exec(`
  CREATE TABLE IF NOT EXISTS step_preparations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      step_id INTEGER NOT NULL,
      message TEXT NOT NULL,
      timing_type TEXT NOT NULL DEFAULT 'before_experiment',
      timing_step_id INTEGER,
      timing_offset_minutes INTEGER DEFAULT 0,
      requires_check INTEGER NOT NULL DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now', 'localtime')),
      FOREIGN KEY (step_id) REFERENCES steps(id) ON DELETE CASCADE,
      FOREIGN KEY (timing_step_id) REFERENCES steps(id) ON DELETE SET NULL
  );

  CREATE TABLE IF NOT EXISTS scheduled_step_preparations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      scheduled_step_id INTEGER NOT NULL,
      step_preparation_id INTEGER NOT NULL,
      is_completed INTEGER NOT NULL DEFAULT 0,
      completed_at TEXT,
      FOREIGN KEY (scheduled_step_id) REFERENCES scheduled_steps(id) ON DELETE CASCADE,
      FOREIGN KEY (step_preparation_id) REFERENCES step_preparations(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS milestone_sub_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      milestone_item_id INTEGER NOT NULL,
      name TEXT NOT NULL,
      is_completed INTEGER NOT NULL DEFAULT 0,
      order_index INTEGER NOT NULL DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now', 'localtime')),
      FOREIGN KEY (milestone_item_id) REFERENCES milestone_items(id) ON DELETE CASCADE
  );
`);

console.log('Migration completed.');
