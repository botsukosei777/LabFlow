import { Router, Request, Response } from 'express';
import db from '../db/database.js';
import { requireAuth } from '../middleware/auth.js';
import { requireSupabase } from '../middleware/supabase.js';
import { getSupabaseAdmin } from '../db/supabase.js';

const router = Router();
router.use(requireSupabase);

// Share a local poll to the team
router.post('/:id/share', async (req: Request, res: Response) => {
  try {
    const { team_id } = req.body;
    const localId = req.params.id;
    const supabase = getSupabaseAdmin();
    
    // Check local poll
    const localPoll = db.prepare('SELECT * FROM polls WHERE id = ? AND user_id = ?').get(localId, req.userId) as any;
    if (!localPoll) return res.status(404).json({ message: 'Local poll not found' });
    if (localPoll.shared_id) return res.json({ id: localPoll.shared_id }); // Already shared
    
    // Get options and votes
    const localOptions = db.prepare('SELECT * FROM poll_options WHERE poll_id = ?').all(localId) as any[];
    const localVotes = db.prepare('SELECT * FROM poll_votes WHERE poll_id = ?').all(localId) as any[];
    
    // Create new shared poll
    const { data: sharedPoll, error: pollError } = await supabase.from('shared_polls').insert([{
      team_id,
      original_local_id: localPoll.id,
      title: localPoll.title,
      description: localPoll.description,
      type: localPoll.type,
      status: localPoll.status,
      deadline: localPoll.deadline,
      settings: JSON.parse(localPoll.settings || '{}'),
      created_by: (req as any).supabaseUserId,
      last_synced_at: new Date().toISOString()
    }]).select().single();
    
    if (pollError) throw pollError;
    
    // Create shared options
    if (localOptions.length > 0) {
      const optionInserts = localOptions.map(opt => ({
        poll_id: sharedPoll.id,
        original_local_id: opt.id,
        text: opt.text,
        order_index: opt.order_index
      }));
      await supabase.from('shared_poll_options').insert(optionInserts);
    }
    
    // Create shared votes
    if (localVotes.length > 0) {
      const voteInserts = localVotes.map(vote => ({
        poll_id: sharedPoll.id,
        original_local_id: vote.id,
        user_id: (req as any).supabaseUserId, // Assumption: creator is the one voting locally so far.
        voter_name: vote.voter_name,
        answers: JSON.parse(vote.answers || '{}'),
        last_synced_at: new Date().toISOString()
      }));
      await supabase.from('shared_poll_votes').insert(voteInserts);
    }
    
    // Save shared_id locally
    db.prepare(`UPDATE polls SET shared_id = ?, updated_at = datetime('now', 'localtime') WHERE id = ?`).run(sharedPoll.id, localId);
    
    res.status(201).json({ id: sharedPoll.id });
  } catch (error: any) {
    console.error('Error sharing poll:', error);
    res.status(500).json({ message: error.message });
  }
});

// Two-way sync for ALL polls the user has access to in the team.
router.post('/sync-all', async (req: Request, res: Response) => {
  try {
    const { team_id } = req.body;
    if (!team_id) return res.status(400).json({ message: 'team_id required' });
    const supabase = getSupabaseAdmin();
    const teamIds = [team_id];
    
    // 1. Fetch all cloud polls for this team
    const { data: cloudPolls, error: pollsError } = await supabase
      .from('shared_polls')
      .select('*')
      .eq('team_id', team_id);
      
    if (pollsError) throw pollsError;
    
    let updatedCount = 0;
    
    if (cloudPolls && cloudPolls.length > 0) {
      const pollIds = cloudPolls.map(p => p.id);
      
      const { data: cloudOptions } = await supabase.from('shared_poll_options').select('*').in('poll_id', pollIds);
      const { data: cloudVotes } = await supabase.from('shared_poll_votes').select('*').in('poll_id', pollIds);
      
      // Process each poll
      const syncPoll = db.transaction(() => {
        for (const cloud of cloudPolls) {
          // Check if it exists locally by shared_id
          const local = db.prepare('SELECT * FROM polls WHERE shared_id = ? AND user_id = ?').get(cloud.id, req.userId) as any;
          let localId = null;
          
          if (!local) {
            // Create local
            const isCreator = cloud.created_by === (req as any).supabaseUserId;
            const settings = cloud.settings || {};
            if (!isCreator) {
              settings.is_imported = true;
            }
            
            const info = db.prepare(`
              INSERT INTO polls (user_id, title, description, type, status, deadline, settings, shared_id, created_at, updated_at)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            `).run(
              req.userId, cloud.title, cloud.description || '', cloud.type, cloud.status, cloud.deadline,
              JSON.stringify(settings), cloud.id, cloud.created_at, cloud.updated_at
            );
            localId = info.lastInsertRowid;
            updatedCount++;
            
            // Insert options
            const opts = cloudOptions?.filter(o => o.poll_id === cloud.id) || [];
            for (const opt of opts) {
              db.prepare(`INSERT INTO poll_options (poll_id, text, order_index, created_at) VALUES (?, ?, ?, ?)`).run(
                localId, opt.text, opt.order_index, opt.created_at
              );
            }
          } else {
            localId = local.id;
            // Basic conflict resolution
            const localUpdated = new Date(local.updated_at).getTime();
            const cloudUpdated = new Date(cloud.updated_at).getTime();
            
            const isCreator = cloud.created_by === (req as any).supabaseUserId;
            const settings = cloud.settings || {};
            if (!isCreator) {
              settings.is_imported = true;
            }

            const isMissingImportedFlag = !isCreator && !(local.settings ? JSON.parse(local.settings).is_imported : false);
            
            if (cloudUpdated > localUpdated || isMissingImportedFlag) {
              db.prepare(`
                UPDATE polls SET title = ?, description = ?, status = ?, deadline = ?, settings = ?, updated_at = ? WHERE id = ?
              `).run(
                cloud.title, cloud.description || '', cloud.status, cloud.deadline,
                JSON.stringify(settings), cloudUpdated > localUpdated ? cloud.updated_at : local.updated_at, localId
              );
              updatedCount++;
            }
          }
          
          // Sync votes (Only pull down other people's votes to view them)
          const cVotes = cloudVotes?.filter(v => v.poll_id === cloud.id) || [];
          const localVotes = db.prepare('SELECT * FROM poll_votes WHERE poll_id = ?').all(localId) as any[];
          
          for (const cv of cVotes) {
            // Match by voter_name (the reliable key across instances)
            const existingLocalVote = localVotes.find(lv => lv.voter_name === cv.voter_name);
            const isMyVote = cv.user_id === (req as any).supabaseUserId;
            const localUserIdForVote = isMyVote ? req.userId : null;
            if (!existingLocalVote) {
               // Use INSERT OR IGNORE to avoid UNIQUE constraint crashes
               db.prepare(`
                 INSERT OR IGNORE INTO poll_votes (poll_id, user_id, voter_name, answers, created_at, updated_at)
                 VALUES (?, ?, ?, ?, ?, ?)
               `).run(localId, localUserIdForVote, cv.voter_name, JSON.stringify(cv.answers || {}), cv.created_at, cv.updated_at);
               updatedCount++;
            } else {
               const lvu = new Date(existingLocalVote.updated_at).getTime();
               const cvu = new Date(cv.updated_at).getTime();
               
               if (cvu > lvu) {
                 db.prepare(`UPDATE poll_votes SET answers = ?, updated_at = ? WHERE id = ?`).run(
                   JSON.stringify(cv.answers || {}), cv.updated_at, existingLocalVote.id
                 );
                 updatedCount++;
               }
            }
          }
        }
      });
      
      syncPoll();
    }
    
    // Now push any local votes that are newer than cloud
    const userLocalVotes = db.prepare(`
      SELECT pv.*, p.shared_id 
      FROM poll_votes pv
      JOIN polls p ON p.id = pv.poll_id
      WHERE p.shared_id IS NOT NULL AND pv.user_id = ?
    `).all(req.userId) as any[];
    
    for (const lv of userLocalVotes) {
      const { data: cloudVote } = await supabase.from('shared_poll_votes')
        .select('id, updated_at')
        .eq('poll_id', lv.shared_id)
        .eq('voter_name', lv.voter_name)
        .maybeSingle();
        
      if (!cloudVote) {
        await supabase.from('shared_poll_votes').insert([{
          poll_id: lv.shared_id,
          original_local_id: lv.id,
          user_id: (req as any).supabaseUserId,
          voter_name: lv.voter_name,
          answers: JSON.parse(lv.answers || '{}'),
          created_at: lv.created_at,
          updated_at: lv.updated_at,
          last_synced_at: new Date().toISOString()
        }]);
      } else {
        const lvu = new Date(lv.updated_at).getTime();
        const cvu = new Date(cloudVote.updated_at).getTime();
        if (lvu > cvu) {
          await supabase.from('shared_poll_votes').update({
            answers: JSON.parse(lv.answers || '{}'),
            updated_at: lv.updated_at,
            last_synced_at: new Date().toISOString()
          }).eq('id', cloudVote.id);
        }
      }
    }
    
    res.json({ message: 'Sync complete', updatedCount });
  } catch (error: any) {
    console.error('Error syncing polls:', error);
    res.status(500).json({ message: error.message });
  }
});

// Delete local mapping and cloud (if owner)
router.delete('/local/:id', async (req: Request, res: Response) => {
  try {
    const localId = req.params.id;
    const supabase = getSupabaseAdmin();
    
    const local = db.prepare('SELECT shared_id FROM polls WHERE id = ?').get(localId) as any;
    if (!local || !local.shared_id) return res.status(400).json({ message: 'Not shared' });
    
    // Get the supabase user ID of the current user to verify ownership in the cloud
    const user = db.prepare('SELECT supabase_user_id FROM users WHERE id = ?').get(req.userId) as any;
    
    if (user?.supabase_user_id) {
      // Attempt delete from cloud
      await supabase.from('shared_polls').delete().eq('id', local.shared_id).eq('created_by', user.supabase_user_id);
    }
    
    // Unlink locally
    db.prepare('UPDATE polls SET shared_id = NULL WHERE id = ?').run(localId);
    
    res.json({ message: 'Unshared successfully' });
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
});

export default router;
