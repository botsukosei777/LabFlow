import dotenv from 'dotenv';
dotenv.config();

console.log('SUPABASE_URL:', process.env.SUPABASE_URL);
console.log('SUPABASE_PUBLISHABLE_KEY length:', process.env.SUPABASE_PUBLISHABLE_KEY?.length);
console.log('SUPABASE_SECRET_KEY length:', process.env.SUPABASE_SECRET_KEY?.length);

import { createClient } from '@supabase/supabase-js';
const supabaseAdmin = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SECRET_KEY);
supabaseAdmin.auth.admin.getUserById('66021e19-9b54-4b8b-bad5-491888a64149')
  .then(res => console.log('Admin getUserById result:', res))
  .catch(err => console.error('Admin getUserById error:', err));
