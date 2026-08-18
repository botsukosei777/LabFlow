const fs = require('fs');
let content = fs.readFileSync('server/index.ts', 'utf8');

content = content.replace("import scheduleRoutes from './routes/schedule.js';", 
  "import scheduleRoutes from './routes/schedule.js';\nimport analysisRoutes from './routes/analysis.js';");

content = content.replace("app.use('/api/schedule', scheduleRoutes);", 
  "app.use('/api/schedule', scheduleRoutes);\napp.use('/api/analysis', analysisRoutes);");

fs.writeFileSync('server/index.ts', content);
