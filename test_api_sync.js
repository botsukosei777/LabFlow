import { createClient } from '@supabase/supabase-js';
import * as fs from 'fs';

const env = fs.readFileSync('.env', 'utf-8');
const urlMatch = env.match(/SUPABASE_URL=([^\r\n]+)/);
const keyMatch = env.match(/SUPABASE_SECRET_KEY=([^\r\n]+)/) || env.match(/SUPABASE_PUBLISHABLE_KEY=([^\r\n]+)/);
const url = urlMatch[1];
const key = keyMatch[1];

async function run() {
  const supabase = createClient(url, key);
  
  // Login as Daisuke Nomura (Creator)
  const { data: authData } = await supabase.auth.signInWithPassword({
    email: 'daisuke.nomura@example.com',
    password: 'password123'
  });
  
  if (!authData.session) {
    console.log("Login failed");
    return;
  }
  
  const token = authData.session.access_token;
  
  // Get teams
  const res1 = await fetch('http://localhost:3001/api/teams', {
    headers: { 'Authorization': `Bearer ${token}` }
  });
  const teams = await res1.json();
  console.log("Teams:", teams);
  
  // Sync-all for team
  if (teams.length > 0) {
    const teamId = teams[0].id;
    console.log("Calling sync-all for team", teamId);
    
    const res2 = await fetch('http://localhost:3001/api/shared/polls/sync-all', {
      method: 'POST',
      headers: { 
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ team_id: teamId })
    });
    
    console.log("Sync response status:", res2.status);
    const result = await res2.json().catch(() => null);
    console.log("Sync result:", result);
  }
}

run().catch(console.error);
