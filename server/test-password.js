// Test password verification for admin user
const bcrypt = require('bcrypt');

const testPassword = 'tech@2026';
const storedHash = '$2b$12$g3AYs4EPyqlzyQy1ZuntY.fT1v6iH0vTTEt5eahqIje1LR89EyzTO';

async function testLogin() {
  console.log('Testing admin login credentials...');
  console.log('Email: agupta88094@gmail.com');
  console.log('Password:', testPassword);
  console.log('');
  
  const isValid = await bcrypt.compare(testPassword, storedHash);
  
  console.log('Password verification:', isValid ? '✅ VALID' : '❌ INVALID');
  console.log('');
  
  if (!isValid) {
    console.log('PROBLEM: Password does not match the stored hash!');
    console.log('Regenerating correct hash...');
    const newHash = await bcrypt.hash(testPassword, 12);
    console.log('New hash:', newHash);
    console.log('');
    console.log('SQL UPDATE:');
    console.log(`UPDATE users SET password_hash='${newHash}' WHERE email='agupta88094@gmail.com';`);
  } else {
    console.log('✅ Credentials are correct. Login should work.');
  }
}

testLogin();
