const fs = require('fs');
const { createClient } = require('@supabase/supabase-js');

const env = fs.readFileSync('.env', 'utf-8');
const urlMatch = env.match(/SUPABASE_URL=([^\r\n]+)/);
const keyMatch = env.match(/SUPABASE_SECRET_KEY=([^\r\n]+)/) || env.match(/SUPABASE_PUBLISHABLE_KEY=([^\r\n]+)/);

if (!urlMatch || !keyMatch) {
  console.log("Could not find url/key in .env");
  process.exit(1);
}

const url = urlMatch[1];
const key = keyMatch[1];

const supabase = createClient(url, key);

async function check() {
  const { data, error } = await supabase.from('shared_poll_votes').select('*');
  console.log("Supabase votes:");
  console.log(JSON.stringify(data, null, 2));
}

check();
