const fs = require('fs');
let c = fs.readFileSync('src/types/index.ts', 'utf-8');

c = c.replace(/blocks\?: ProtocolBlock\[\];/, "blocks?: ProtocolBlock[];\n  has_sample_dependent_steps?: boolean;");

fs.writeFileSync('src/types/index.ts', c);
