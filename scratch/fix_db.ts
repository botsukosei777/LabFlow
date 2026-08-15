import db from '../server/db/database.ts';
try {
  const settings = JSON.stringify({timeEnd:"19:00",timeStart:"13:00",intervalMin:15,is_imported:true});
  const settings5 = JSON.stringify({"questions":[{"id":"q_xi5yrflh2","type":"single_choice","text":"","options":["あ","い","う","え"]},{"id":"q_ms017t31i","type":"multiple_choice","text":"","options":["お","か","き","く"]},{"id":"q_2p6bdz46c","type":"text","text":"これは質問文ですか？"}],is_imported:true});
  
  db.prepare("UPDATE polls SET settings = ? WHERE id = 4").run(settings);
  db.prepare("UPDATE polls SET settings = ? WHERE id = 5").run(settings5);
  
  db.prepare("UPDATE poll_votes SET user_id = null WHERE id IN (3, 4)").run();
  
  const polls = db.prepare('SELECT id, user_id, title, settings, shared_id FROM polls').all();
  const votes = db.prepare('SELECT id, poll_id, user_id, voter_name FROM poll_votes').all(); 
  console.log({polls, votes});
  
  console.log('Fixed DB manually');
} catch(e) {
  console.error(e);
}
