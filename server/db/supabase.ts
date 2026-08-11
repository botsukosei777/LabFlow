import { createClient, SupabaseClient } from '@supabase/supabase-js';

let supabaseClient: SupabaseClient | null = null;
let supabaseAdminClient: SupabaseClient | null = null;
let loggedStatus = false;

export const isSupabaseEnabled = (): boolean => {
  return Boolean(process.env.SUPABASE_URL && process.env.SUPABASE_PUBLISHABLE_KEY);
};

export const getSupabase = (): SupabaseClient | null => {
  if (!isSupabaseEnabled()) {
    if (!loggedStatus) {
      console.log('Supabase is not enabled. SUPABASE_URL or SUPABASE_PUBLISHABLE_KEY is missing.');
      loggedStatus = true;
    }
    return null;
  }

  if (!supabaseClient) {
    const url = process.env.SUPABASE_URL!;
    const key = process.env.SUPABASE_PUBLISHABLE_KEY!;
    supabaseClient = createClient(url, key);
    if (!loggedStatus) {
      console.log('Supabase client initialized successfully.');
      loggedStatus = true;
    }
  }

  return supabaseClient;
};

export const getSupabaseAdmin = (): SupabaseClient | null => {
  if (!isSupabaseEnabled() || !process.env.SUPABASE_SECRET_KEY) {
    return null;
  }

  if (!supabaseAdminClient) {
    const url = process.env.SUPABASE_URL!;
    const serviceKey = process.env.SUPABASE_SECRET_KEY!;
    supabaseAdminClient = createClient(url, serviceKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false
      }
    });
  }

  return supabaseAdminClient;
};
