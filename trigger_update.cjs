const fs = require('fs');
// Mock process.cwd and dependencies to run server.cjs
require('./release/server.cjs');

// Mock request
const http = require('http');
const req = http.request({
  hostname: 'localhost',
  port: 3001,
  path: '/api/settings/update/apply',
  method: 'POST',
  headers: {
    'Content-Type': 'application/json'
  }
}, res => {
  res.on('data', d => process.stdout.write(d));
});
req.write(JSON.stringify({ download_url: 'https://github.com/maroj/labflow/releases/download/v1.0.2/labflow-release.zip' }));
req.end();
