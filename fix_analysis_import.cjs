const fs = require('fs');
let c = fs.readFileSync('src/pages/Analysis.tsx', 'utf-8');
c = c.replace("import api from '../lib/api';", "import { api } from '../api/client';");
fs.writeFileSync('src/pages/Analysis.tsx', c);
