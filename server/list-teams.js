require('dotenv').config();
const db = require('./config/db');

async function listTeams() {
  try {
    console.log('\n=== ALL REGISTERED TEAMS ===\n');
    
    const [teams] = await db.query(`
      SELECT 
        t.id,
        t.team_name,
        t.status,
        t.level,
        t.created_at,
        u.email,
        u.name as user_name,
        u.is_verified,
        u.role
      FROM teams t
      JOIN users u ON t.user_id = u.id
      ORDER BY t.created_at DESC
    `);
    
    if (teams.length === 0) {
      console.log('❌ No teams registered yet\n');
    } else {
      console.log(`Found ${teams.length} team(s):\n`);
      teams.forEach((t, i) => {
        console.log(`${i + 1}. ${t.team_name}`);
        console.log(`   Leader: ${t.user_name} (${t.email})`);
        console.log(`   Verified: ${t.is_verified ? '✅' : '❌'}`);
        console.log(`   Status: ${t.status}`);
        console.log(`   Level: ${t.level}`);
        console.log(`   Created: ${new Date(t.created_at).toLocaleString()}`);
        console.log('');
      });
    }
    
    const [[{ totalUsers }]] = await db.query('SELECT COUNT(*) as totalUsers FROM users WHERE role = "team"');
    const [[{ totalTeams }]] = await db.query('SELECT COUNT(*) as totalTeams FROM teams');
    
    console.log('=== SUMMARY ===');
    console.log(`Total team users: ${totalUsers}`);
    console.log(`Total teams: ${totalTeams}`);
    console.log('');
    
    process.exit(0);
  } catch (error) {
    console.error('Error:', error.message);
    process.exit(1);
  }
}

listTeams();
