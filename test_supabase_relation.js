import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
dotenv.config();

const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

async function test() {
  const { data, error } = await supabase
    .from('shared_experiment_types')
    .select(`
      *,
      steps:shared_steps(
        *,
        step_preparations:shared_step_preparations!step_id(*)
      )
    `)
    .limit(1);

  if (error) {
    console.error('ERROR:', error);
  } else {
    console.log('SUCCESS! Got', data?.length, 'rows');
  }
}

test();
