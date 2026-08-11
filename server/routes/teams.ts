import { Router, Request, Response } from 'express';
import { requireSupabase } from '../middleware/supabase.js';
import { getSupabaseAdmin } from '../db/supabase.js';
import { requireAuth } from '../middleware/auth.js'; // Assuming requireAuth exists
import db from '../db/database.js';

const router = Router();

// requireSupabase is applied at router level (requireAuth is already applied in index.ts)
router.use(requireSupabase);

router.post('/', async (req: Request, res: Response) => {
  try {
    const { name, description } = req.body;
    // Use admin client to bypass RLS for the create & join sequence
    const adminSupabase = getSupabaseAdmin();
    if (!adminSupabase) throw new Error('Supabase admin not configured');
    
    // Create team
    const { data: team, error: teamError } = await adminSupabase
      .from('teams')
      .insert([{ name, description, created_by: req.supabaseUserId }])
      .select()
      .single();
      
    if (teamError) throw teamError;
    
    // Add owner to members
    const { error: memberError } = await adminSupabase
      .from('team_members')
      .insert([{ 
        team_id: team.id, 
        user_id: req.supabaseUserId, 
        role: 'owner' 
      }]);
      
    if (memberError) throw memberError;
    
    res.status(201).json(team);
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
});

router.get('/', async (req: Request, res: Response) => {
  try {
    const supabase = req.userSupabase;
    const { data, error } = await supabase
      .from('team_members')
      .select('role, teams(id, name, description, created_at, invite_code)')
      .eq('user_id', req.supabaseUserId);
      
    if (error) throw error;
    
    const teams = data.map((d: any) => ({
      ...d.teams,
      my_role: d.role
    }));
    res.json(teams);
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
});

router.get('/:id', async (req: Request, res: Response) => {
  try {
    const supabase = req.userSupabase;
    const { data: team, error: teamError } = await supabase
      .from('teams')
      .select('*')
      .eq('id', req.params.id)
      .single();
      
    if (teamError) throw teamError;
    
    const { data: members, error: membersError } = await supabase
      .from('team_members')
      .select('*, profiles(username, email)')
      .eq('team_id', req.params.id);
      
    if (membersError) throw membersError;
    
    const formattedMembers = members.map((m: any) => ({
      ...m,
      user: m.profiles
    }));
    
    const myMemberRecord = members.find((m: any) => m.user_id === req.supabaseUserId);
    const my_role = myMemberRecord ? myMemberRecord.role : 'member';
    
    res.json({ ...team, my_role, members: formattedMembers });
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
});

router.put('/:id', async (req: Request, res: Response) => {
  try {
    const { name, description } = req.body;
    const supabase = req.userSupabase;
    
    const { data, error } = await supabase
      .from('teams')
      .update({ name, description })
      .eq('id', req.params.id)
      .select()
      .single();
      
    if (error) throw error;
    res.json(data);
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
});

router.delete('/:id', async (req: Request, res: Response) => {
  try {
    const supabase = req.userSupabase;
    const { error } = await supabase
      .from('teams')
      .delete()
      .eq('id', req.params.id);
      
    if (error) throw error;
    res.status(204).send();
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
});

router.post('/join', async (req: Request, res: Response) => {
  try {
    const { invite_code } = req.body;
    const adminSupabase = getSupabaseAdmin();
    if (!adminSupabase) throw new Error('Supabase admin not configured');
    
    // Find team by invite code using admin to bypass RLS
    const { data: team, error: teamError } = await adminSupabase
      .from('teams')
      .select('id')
      .eq('invite_code', invite_code)
      .maybeSingle();
      
    if (teamError) throw teamError;
    if (!team) return res.status(404).json({ message: 'Invalid invite code' });
    
    // Insert using admin to bypass RLS
    const { error: joinError } = await adminSupabase
      .from('team_members')
      .insert([{ team_id: team.id, user_id: req.supabaseUserId, role: 'member' }]);
      
    if (joinError) throw joinError;
    
    // Fetch the joined team to return it
    const { data: joinedTeam, error: fetchError } = await adminSupabase
      .from('teams')
      .select('*, member_count:team_members(count), my_role:team_members!inner(role)')
      .eq('id', team.id)
      .eq('team_members.user_id', req.supabaseUserId)
      .single();
      
    if (fetchError) throw fetchError;
    
    // Format response properly for the frontend
    const formattedTeam = {
      ...joinedTeam,
      member_count: joinedTeam.member_count[0]?.count || 1,
      my_role: joinedTeam.my_role[0]?.role || 'member'
    };
    
    res.status(200).json({ message: 'Joined team successfully', team: formattedTeam });
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
});

router.get('/:id/members', async (req: Request, res: Response) => {
  try {
    const supabase = req.userSupabase;
    const { data, error } = await supabase
      .from('team_members')
      .select('user_id, role, joined_at, profiles(username, email)')
      .eq('team_id', req.params.id);
      
    if (error) throw error;
    const formattedData = data.map((m: any) => ({
      user_id: m.user_id,
      role: m.role,
      joined_at: m.joined_at,
      user: m.profiles
    }));
    res.json(formattedData);
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
});

router.delete('/:id/members/:uid', async (req: Request, res: Response) => {
  try {
    // Check if current user is owner (or the user themselves leaving)
    const adminSupabase = getSupabaseAdmin();
    if (!adminSupabase) throw new Error('Supabase admin not configured');
    
    if (req.params.uid !== req.supabaseUserId) {
      const { data: myMember } = await adminSupabase
        .from('team_members')
        .select('role')
        .eq('team_id', req.params.id)
        .eq('user_id', req.supabaseUserId)
        .single();
        
      if (!myMember || myMember.role !== 'owner') {
        return res.status(403).json({ message: 'Only team owners can remove other members' });
      }
    }

    const supabase = req.userSupabase;
    const { error } = await supabase
      .from('team_members')
      .delete()
      .eq('team_id', req.params.id)
      .eq('user_id', req.params.uid);
      
    if (error) throw error;
    res.status(204).send();
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
});

router.put('/:id/members/:uid', async (req: Request, res: Response) => {
  try {
    const { role } = req.body;
    
    // Check if current user is owner
    const adminSupabase = getSupabaseAdmin();
    if (!adminSupabase) throw new Error('Supabase admin not configured');
    
    const { data: myMember } = await adminSupabase
      .from('team_members')
      .select('role')
      .eq('team_id', req.params.id)
      .eq('user_id', req.supabaseUserId)
      .single();
      
    if (!myMember || myMember.role !== 'owner') {
      return res.status(403).json({ message: 'Only team owners can change member roles' });
    }

    const supabase = req.userSupabase;
    const { data, error } = await supabase
      .from('team_members')
      .update({ role })
      .eq('team_id', req.params.id)
      .eq('user_id', req.params.uid)
      .select()
      .single();
      
    if (error) throw error;
    res.json(data);
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
});

router.post('/:id/regenerate-code', async (req: Request, res: Response) => {
  try {
    const supabase = req.userSupabase;
    
    // Basic UUID generation for invite code
    const newCode = crypto.randomUUID();
    
    const { data, error } = await supabase
      .from('teams')
      .update({ invite_code: newCode })
      .eq('id', req.params.id)
      .select('invite_code')
      .single();
      
    if (error) throw error;
    res.json(data);
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
});

export default router;
