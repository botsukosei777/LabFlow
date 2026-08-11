import { Router, Request, Response } from 'express';
import { getSupabaseAdmin } from '../db/supabase.js';
import db from '../db/database.js';

const router = Router();

// Test route to see if insert works
router.post('/test_insert', async (req: Request, res: Response) => {
  try {
    const adminSupabase = getSupabaseAdmin();
    if (!adminSupabase) throw new Error('Supabase admin not configured');
    
    // Hardcode the user ID that we know exists
    const userId = '66021e19-9b54-4b8b-bad5-491888a64149';
    
    console.log('Attempting to create team...');
    const { data: team, error: teamError } = await adminSupabase
      .from('teams')
      .insert([{ name: 'Test Insert', description: 'Testing', created_by: userId }])
      .select()
      .single();
      
    if (teamError) {
      console.error('Insert Error:', teamError);
      return res.status(500).json({ error: teamError });
    }
    
    res.json({ success: true, team });
  } catch (error: any) {
    console.error('Catch Error:', error);
    res.status(500).json({ message: error.message });
  }
});

export default router;
