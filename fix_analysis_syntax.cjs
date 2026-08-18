const fs = require('fs');
let c = fs.readFileSync('src/pages/Analysis.tsx', 'utf-8');
c = c.replace(/\\`/g, '`');
c = c.replace(/\\\$/g, '$');
fs.writeFileSync('src/pages/Analysis.tsx', c);
