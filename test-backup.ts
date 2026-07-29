import Database from 'better-sqlite3';
const db = new Database(':memory:');
db.exec('CREATE TABLE test (id INTEGER); INSERT INTO test VALUES (1);');
const p = db.backup('test-backup.db');
console.log('Type of backup result:', typeof p);
if (p instanceof Promise) {
    p.then(() => {
        console.log('Promise resolved');
        const fs = require('fs');
        console.log('File size:', fs.statSync('test-backup.db').size);
    });
} else {
    console.log('Not a promise');
}
