const http = require('http');

const options = {
  hostname: 'localhost',
  port: 3001,
  path: '/api/experiments/blocks/6',
  method: 'PUT',
  headers: {
    'Content-Type': 'application/json',
    'x-user-id': '1' // The backend uses this middleware for auth
  }
};

const req = http.request(options, (res) => {
  let data = '';
  res.on('data', chunk => data += chunk);
  res.on('end', () => console.log('Response:', data));
});

const body = JSON.stringify({
  name: 'Test Block',
  description: '',
  pattern_label: 'default',
  order_index: 0,
  step_nodes: [
    [
      [
        { step_id: 11, delay_minutes: 0 },
        { step_id: 12, delay_minutes: 60 }
      ],
      [
        { step_id: 13, delay_minutes: 235 },
        { step_id: 14, delay_minutes: 265 }
      ]
    ]
  ]
});

req.write(body);
req.end();
