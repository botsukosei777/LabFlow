const http = require('http');

const options = {
  hostname: 'localhost',
  port: 3001,
  path: '/api/shared/sub-protocols',
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'x-supabase-token': 'fake-token',
    'Authorization': 'Bearer fake-jwt'
  }
};

const req = http.request(options, res => {
  console.log('Status:', res.statusCode);
  let data = '';
  res.on('data', chunk => data += chunk);
  res.on('end', () => console.log('Body:', data));
});

req.on('error', e => console.error('Error:', e));
req.write(JSON.stringify({ team_id: '77eb4d11-763a-41bf-bfcc-004945ed70de', local_sub_protocol_id: 1 }));
req.end();
