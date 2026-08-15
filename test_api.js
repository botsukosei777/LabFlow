const http = require('http');

const options = {
  hostname: 'localhost',
  port: 3001,
  path: '/api/shared/polls/sync-all',
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'x-user-id': '1',
    'x-supabase-token': 'dummy' // Will fail requireSupabase if token is needed?
  }
};
