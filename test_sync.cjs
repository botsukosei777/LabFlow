const fs = require('fs');
const { createClient } = require('@supabase/supabase-js');
const db = require('better-sqlite3')('data/labflow.db');

const env = fs.readFileSync('.env', 'utf-8');
const urlMatch = env.match(/SUPABASE_URL=([^\r\n]+)/);
const keyMatch = env.match(/SUPABASE_SECRET_KEY=([^\r\n]+)/) || env.match(/SUPABASE_PUBLISHABLE_KEY=([^\r\n]+)/);
const url = urlMatch[1];
const key = keyMatch[1];
const supabase = createClient(url, key);

async function runSyncAll(userId) {
  const user = db.prepare('SELECT supabase_user_id FROM users WHERE id = ?').get(userId);
  const supabaseUserId = user.supabase_user_id;
  
  const userLocalPolls = db.prepare('SELECT id, shared_id FROM polls WHERE shared_id IS NOT NULL AND user_id = ?').all(userId);
  const localPollMap = new Map(userLocalPolls.map(p => [p.shared_id, p.id]));
  
  console.log("Local mapped polls for user", userId, ":", localPollMap);
  
  // Use a hardcoded teamId from Supabase directly to bypass local team tables mapping
  const { data: teams } = await supabase.from('team_members').select('team_id').eq('user_id', supabaseUserId);
  const teamIds = teams.map(t => t.team_id);
  console.log("Teams for user", userId, ":", teamIds);
  
  if (teamIds.length === 0) return;
  
  const { data: cloudPolls, error } = await supabase.from('shared_polls').select('*').in('team_id', teamIds);
  console.log("Cloud polls:", cloudPolls.map(p => p.id));
  
  const cloudIds = cloudPolls.map(p => p.id);
  const { data: cloudVotes } = await supabase.from('shared_poll_votes').select('*').in('poll_id', cloudIds);
  
  console.log("Cloud votes fetched:", cloudVotes.length);
  
  let updatedCount = 0;
  for (const cv of cloudVotes) {
    const localId = localPollMap.get(cv.poll_id);
    if (!localId) continue;
    
    const isMyVote = (cv.user_id === supabaseUserId);
    console.log("Processing cloud vote:", cv.voter_name, "for local poll", localId, "isMyVote?", isMyVote);
    
    const existingLocalVote = db.prepare('SELECT * FROM poll_votes WHERE poll_id = ? AND voter_name = ?').get(localId, cv.voter_name);
    
    if (!existingLocalVote) {
       console.log("-> Inserting new local vote");
       const localUserIdForVote = isMyVote ? userId : null;
       try {
         db.prepare(`
           INSERT INTO poll_votes (poll_id, user_id, voter_name, answers, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?)
         `).run(localId, localUserIdForVote, cv.voter_name, JSON.stringify(cv.answers || {}), cv.created_at, cv.updated_at);
       } catch(e) {
         console.error("INSERT ERROR:", e.message);
       }
       updatedCount++;
    } else {
       console.log("-> Updating existing local vote", existingLocalVote.id);
    }
  }
}

runSyncAll(1).catch(console.error);
