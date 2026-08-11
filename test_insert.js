import dotenv from 'dotenv';
dotenv.config();

import { createClient } from '@supabase/supabase-js';
const adminSupabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SECRET_KEY);

async function testInsert() {
  const userId = '66021e19-9b54-4b8b-bad5-491888a64149';
  console.log('Attempting to create team...');
  const { data: team, error: teamError } = await adminSupabase
    .from('teams')
    .insert([{ name: 'Test Team', description: 'Test', created_by: userId }])
    .select()
    .single();
    
  if (teamError) {
    console.error('Insert Error:', JSON.stringify(teamError, null, 2));
  } else {
    console.log('Success:', team);
  }
}

testInsert();
