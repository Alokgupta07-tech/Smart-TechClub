// Quick script to hash admin password
const bcrypt = require('bcrypt');
const { v4: uuidv4 } = require('uuid');

async function hashAdminPassword() {
  const password = 'tech@2026'; // Admin password
  const hash = await bcrypt.hash(password, 12); // 12 rounds for production security
  const adminId = uuidv4();
  
  console.log('=================================');
  console.log('ADMIN CREDENTIALS (DO NOT COMMIT)');
  console.log('=================================');
  console.log('Email:', 'agupta88094@gmail.com');
  console.log('Password:', password);
  console.log('ID:', adminId);
  console.log('Hash:', hash);
  console.log('\n=================================');
  console.log('SQL INSERT COMMAND:');
  console.log('=================================');
  console.log(`INSERT INTO users (id, name, email, password_hash, role, is_verified, created_at) VALUES ('${adminId}', 'Admin', 'agupta88094@gmail.com', '${hash}', 'admin', TRUE, NOW());`);
  console.log('\n=================================');
  console.log('VERIFICATION QUERY:');
  console.log('=================================');
  console.log("SELECT id, name, email, role, is_verified FROM users WHERE email='agupta88094@gmail.com';");
}

hashAdminPassword();
