const fs = require('fs');
const path = require('path');
const mysql = require('mysql2/promise');
require('dotenv').config();

/**
 * Database Migration Runner
 * Executes schema.sql to set up all tables
 */

async function runMigrations() {
  console.log('🔄 Starting database migrations...\n');

  // Create connection
  const connection = await mysql.createConnection({
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME || 'lockdown_hq',
    multipleStatements: true
  });

  console.log('✅ Connected to MySQL database\n');

  // Read schema file
  const schemaPath = path.join(__dirname, 'schema.sql');
  const schema = fs.readFileSync(schemaPath, 'utf8');

  try {
    // Execute schema
    await connection.query(schema);
    console.log('✅ All tables created successfully!\n');

    // Show created tables
    const [tables] = await connection.query('SHOW TABLES');
    console.log('📋 Created tables:');
    tables.forEach(table => {
      console.log(`   - ${Object.values(table)[0]}`);
    });

    console.log('\n✅ Migration completed!\n');
    console.log('🔐 Next steps:');
    console.log('   1. Create an admin user manually (see schema.sql)');
    console.log('   2. Start the server: npm run dev\n');

  } catch (error) {
    console.error('❌ Migration failed:', error.message);
    process.exit(1);
  } finally {
    await connection.end();
  }
}

runMigrations();
