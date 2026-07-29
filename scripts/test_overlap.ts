import db from '../server/db/database.js';

const events = db.prepare('SELECT * FROM events').all();
const exps = db.prepare('SELECT * FROM scheduled_experiments').all();
const blocks = db.prepare('SELECT * FROM scheduled_blocks').all();
const steps = db.prepare('SELECT * FROM scheduled_steps').all();
console.log(JSON.stringify({events, exps, blocks, steps}, null, 2));
