require('dotenv').config();
const db = require('../config/db');

(async () => {
  try {
    console.log('Fixing sessions table...');
    
    await db.query('DROP TABLE IF EXISTS sessions');
    
    const createSessionsTable = `
      CREATE TABLE sessions (
        id CHAR(36) PRIMARY KEY DEFAULT (UUID()),
        team_id CHAR(36) NOT NULL,
        user_id CHAR(36) NOT NULL,
        session_token VARCHAR(500) NOT NULL,
        ip_address VARCHAR(45),
        user_agent TEXT,
        is_active BOOLEAN DEFAULT true,
        last_activity TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        expires_at TIMESTAMP NULL,
        FOREIGN KEY (team_id) REFERENCES teams(id) ON DELETE CASCADE,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
        INDEX idx_team (team_id),
        INDEX idx_token (session_token(255)),
        INDEX idx_active (is_active),
        INDEX idx_expires (expires_at)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `;
    
    await db.query(createSessionsTable);
    console.log('✅ Sessions table created successfully');
    process.exit(0);
  } catch (e) {
    console.error('❌ Error:', e.message);
    process.exit(1);
  }
})();
