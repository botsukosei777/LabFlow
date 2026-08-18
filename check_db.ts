import Database from 'better-sqlite3';
import path from 'path';

const db = new Database(path.join(process.cwd(), 'data', 'labflow.db'));

const info = db.prepare("SELECT sql FROM sqlite_master WHERE name = 'poll_votes'").get() as any;
console.log(info.sql);

const votes = db.prepare('SELECT id, poll_id, user_id, voter_name FROM poll_votes').all();
console.log('\n=== Votes ===');
console.log(JSON.stringify(votes, null, 2));

db.close();
