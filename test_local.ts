import Database from 'better-sqlite3';
import path from 'path';

const dbPath = path.join(process.cwd(), 'data', 'labflow.db');
const db = new Database(dbPath);

const polls = db.prepare('SELECT id, user_id, title, shared_id, type, settings FROM polls').all();
console.log('=== Local Polls ===');
console.log(JSON.stringify(polls, null, 2));
db.close();
