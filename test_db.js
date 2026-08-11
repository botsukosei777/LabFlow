async function test() {
  console.log('Fetching users...');
  import('better-sqlite3').then((sqlite3) => {
    const db = sqlite3.default('./data/labflow.db');
    const user = db.prepare('SELECT id, supabase_user_id FROM users LIMIT 1').get();
    console.log('Local user:', user);
  });
}
test();
