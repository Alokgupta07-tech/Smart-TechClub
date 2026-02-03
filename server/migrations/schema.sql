-- ============================================
-- LOCKDOWN HQ - DATABASE SCHEMA
-- MySQL Enterprise Authentication System
-- ============================================

-- 1️⃣ USERS TABLE
CREATE TABLE IF NOT EXISTS users (
  id CHAR(36) PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  email VARCHAR(150) UNIQUE NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  role ENUM('admin', 'team') NOT NULL,
  is_verified BOOLEAN DEFAULT FALSE,
  two_fa_enabled BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_email (email),
  INDEX idx_role (role)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 2️⃣ TEAMS TABLE
CREATE TABLE IF NOT EXISTS teams (
  id CHAR(36) PRIMARY KEY,
  user_id CHAR(36) UNIQUE NOT NULL,
  team_name VARCHAR(100) NOT NULL,
  level INT DEFAULT 1,
  status ENUM('waiting', 'active', 'completed', 'disqualified') DEFAULT 'waiting',
  progress INT DEFAULT 0,
  hints_used INT DEFAULT 0,
  start_time DATETIME,
  end_time DATETIME,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  INDEX idx_status (status),
  INDEX idx_level (level)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 3️⃣ REFRESH TOKENS TABLE
CREATE TABLE IF NOT EXISTS refresh_tokens (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id CHAR(36) NOT NULL,
  token VARCHAR(500) NOT NULL,
  expires_at DATETIME NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  INDEX idx_token (token(255)),
  INDEX idx_user_id (user_id),
  INDEX idx_expires_at (expires_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 4️⃣ EMAIL OTPS TABLE
CREATE TABLE IF NOT EXISTS email_otps (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id CHAR(36) NOT NULL,
  otp VARCHAR(6) NOT NULL,
  purpose ENUM('verify', 'reset', '2fa') NOT NULL,
  expires_at DATETIME NOT NULL,
  used BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  INDEX idx_user_id (user_id),
  INDEX idx_otp (otp),
  INDEX idx_expires_at (expires_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 5️⃣ AUDIT LOGS TABLE
CREATE TABLE IF NOT EXISTS audit_logs (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id CHAR(36),
  action VARCHAR(100) NOT NULL,
  ip_address VARCHAR(45),
  user_agent VARCHAR(255),
  details TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL,
  INDEX idx_user_id (user_id),
  INDEX idx_action (action),
  INDEX idx_created_at (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================
-- CLEANUP EXPIRED RECORDS (OPTIONAL CRON JOB)
-- ============================================

-- Delete expired refresh tokens
-- DELETE FROM refresh_tokens WHERE expires_at < NOW();

-- Delete expired/used OTPs older than 24 hours
-- DELETE FROM email_otps WHERE created_at < DATE_SUB(NOW(), INTERVAL 24 HOUR);

-- ============================================
-- SAMPLE ADMIN USER (MANUAL CREATION)
-- ============================================

-- Step 1: Generate password hash in Node.js:
-- node -e "console.log(require('bcrypt').hashSync('AdminPassword123!', 10))"

-- Step 2: Insert admin user (replace password_hash with generated hash):
-- INSERT INTO users (id, name, email, password_hash, role, is_verified) 
-- VALUES (
--   UUID(),
--   'System Admin',
--   'admin@lockdownhq.com',
--   '$2b$10$YOUR_HASHED_PASSWORD_HERE',
--   'admin',
--   TRUE
-- );
