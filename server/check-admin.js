require('dotenv').config();
const db = require('./config/db');
const { comparePassword } = require('./utils/password');

async function checkAdmin() {
  try {
    console.log('\n=== CHECKING ADMIN USER ===\n');
    
    const email = process.env.ADMIN_EMAIL || 'agupta88094@gmail.com';
    const password = process.env.ADMIN_PASSWORD || 'tech@2026';
    
    console.log('Looking for admin with email:', email);
    
    const [users] = await db.query('SELECT * FROM users WHERE email = ?', [email]);
    
    if (users.length === 0) {
      console.log('❌ Admin user NOT FOUND in database');
      console.log('Run this command to create admin:');
      console.log('node server/create-admin.js');
      process.exit(1);
    }
    
    const user = users[0];
    console.log('✅ Admin user found:');
    console.log('   ID:', user.id);
    console.log('   Email:', user.email);
    console.log('   Role:', user.role);
    console.log('   Verified:', user.is_verified);
    console.log('   Created:', user.created_at);
    
    // Test password
    const isValid = await comparePassword(password, user.password_hash);
    console.log('\n=== PASSWORD CHECK ===');
    console.log('Testing password:', password);
    console.log('Result:', isValid ? '✅ CORRECT' : '❌ WRONG');
    
    if (!isValid) {
      console.log('\n⚠️ Password does not match! Set ADMIN_FORCE_RESET=true in .env and restart server.');
    }
    
    process.exit(0);
  } catch (error) {
    console.error('Error:', error.message);
    process.exit(1);
  }
}

checkAdmin();
