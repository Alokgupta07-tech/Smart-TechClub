-- ============================================
-- LOCKDOWN HQ - MySQL Database Schema
-- Production-ready schema for Mission Control
-- ============================================

-- Drop existing tables (for clean setup)
DROP TABLE IF EXISTS activity_logs;
DROP TABLE IF EXISTS teams;
DROP TABLE IF EXISTS users;

-- ============================================
-- USERS TABLE
-- Stores all registered users (teams and admins)
-- ============================================
CREATE TABLE users (
  id CHAR(36) PRIMARY KEY DEFAULT (UUID()),
  name VARCHAR(100) NOT NULL,
  email VARCHAR(150) UNIQUE NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  role ENUM('admin', 'team') DEFAULT 'team',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_email (email),
  INDEX idx_role (role)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================
-- TEAMS TABLE
-- Stores team progress and status
-- ============================================
CREATE TABLE teams (
  id CHAR(36) PRIMARY KEY DEFAULT (UUID()),
  user_id CHAR(36) NOT NULL,
  team_name VARCHAR(100) NOT NULL UNIQUE,
  level INT DEFAULT 1,
  status ENUM('waiting', 'active', 'completed', 'disqualified') DEFAULT 'waiting',
  progress INT DEFAULT 0 CHECK (progress >= 0 AND progress <= 100),
  start_time DATETIME NULL,
  end_time DATETIME NULL,
  hints_used INT DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  INDEX idx_status (status),
  INDEX idx_level (level),
  INDEX idx_created_at (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================
-- ACTIVITY LOGS TABLE
-- Tracks all team activities and violations
-- ============================================
CREATE TABLE activity_logs (
  id INT AUTO_INCREMENT PRIMARY KEY,
  team_id CHAR(36) NOT NULL,
  type ENUM('tab_switch', 'violation', 'level_complete', 'hint_used', 'system') NOT NULL,
  message VARCHAR(255) NOT NULL,
  severity ENUM('info', 'warning', 'critical') DEFAULT 'info',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (team_id) REFERENCES teams(id) ON DELETE CASCADE,
  INDEX idx_team_id (team_id),
  INDEX idx_created_at (created_at),
  INDEX idx_type (type)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================
-- VIEWS FOR COMMON QUERIES
-- ============================================

-- View: Team details with calculated time
CREATE OR REPLACE VIEW v_team_details AS
SELECT 
  t.id,
  t.team_name AS teamName,
  t.level,
  t.status,
  t.progress,
  t.start_time AS startTime,
  t.end_time AS endTime,
  t.hints_used AS hintsUsed,
  CASE 
    WHEN t.start_time IS NOT NULL AND t.end_time IS NULL THEN
      SEC_TO_TIME(TIMESTAMPDIFF(SECOND, t.start_time, NOW()))
    WHEN t.start_time IS NOT NULL AND t.end_time IS NOT NULL THEN
      SEC_TO_TIME(TIMESTAMPDIFF(SECOND, t.start_time, t.end_time))
    ELSE '00:00:00'
  END AS timeElapsed,
  TIMESTAMPDIFF(SECOND, t.start_time, COALESCE(t.end_time, NOW())) AS timeElapsedSeconds,
  t.created_at AS createdAt,
  u.name AS userName,
  u.email AS userEmail
FROM teams t
INNER JOIN users u ON t.user_id = u.id;

-- ============================================
-- STORED PROCEDURES
-- ============================================

-- Procedure: Get Admin Stats
DELIMITER //
CREATE PROCEDURE sp_get_admin_stats()
BEGIN
  SELECT
    COUNT(*) AS totalTeams,
    SUM(CASE WHEN status = 'active' THEN 1 ELSE 0 END) AS active,
    SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) AS completed,
    SUM(CASE WHEN status = 'waiting' THEN 1 ELSE 0 END) AS waiting,
    COALESCE(
      SEC_TO_TIME(
        AVG(
          CASE 
            WHEN start_time IS NOT NULL AND end_time IS NOT NULL 
            THEN TIMESTAMPDIFF(SECOND, start_time, end_time)
            ELSE NULL
          END
        )
      ),
      '00:00:00'
    ) AS avgTime,
    SUM(hints_used) AS hintsUsed
  FROM teams;
END //
DELIMITER ;

-- Procedure: Get Leaderboard
DELIMITER //
CREATE PROCEDURE sp_get_leaderboard()
BEGIN
  SELECT 
    t.id,
    t.team_name AS teamName,
    t.level,
    t.status,
    t.progress,
    t.hints_used AS hintsUsed,
    CASE 
      WHEN t.start_time IS NOT NULL AND t.end_time IS NOT NULL THEN
        SEC_TO_TIME(TIMESTAMPDIFF(SECOND, t.start_time, t.end_time))
      ELSE NULL
    END AS totalTime,
    TIMESTAMPDIFF(SECOND, t.start_time, t.end_time) AS totalTimeSeconds,
    t.created_at AS createdAt
  FROM teams t
  WHERE t.status IN ('active', 'completed')
  ORDER BY 
    CASE WHEN t.status = 'completed' THEN 0 ELSE 1 END,
    totalTimeSeconds ASC,
    t.hints_used ASC,
    t.created_at ASC;
END //
DELIMITER ;

-- ============================================
-- TRIGGERS
-- ============================================

-- Trigger: Auto-start timer when status becomes 'active'
DELIMITER //
CREATE TRIGGER trg_team_auto_start
BEFORE UPDATE ON teams
FOR EACH ROW
BEGIN
  IF NEW.status = 'active' AND OLD.status != 'active' AND NEW.start_time IS NULL THEN
    SET NEW.start_time = NOW();
  END IF;
  
  IF NEW.status = 'completed' AND OLD.status != 'completed' AND NEW.end_time IS NULL THEN
    SET NEW.end_time = NOW();
  END IF;
END //
DELIMITER ;

-- ============================================
-- SEED DATA (ADMIN USER ONLY)
-- ============================================

-- Create default admin user
-- Password: admin123 (CHANGE THIS IN PRODUCTION!)
INSERT INTO users (id, name, email, password_hash, role) 
VALUES (
  UUID(),
  'Admin',
  'admin@lockdownhq.com',
  '$2a$10$X1KZWvKZh4jXcB.uNxJz6eYKJ6Y5J8vZt9YhZ4C3r2h4K5L6M7N8P', -- Bcrypt hash of 'admin123'
  'admin'
);

-- ============================================
-- INDICES FOR PERFORMANCE
-- ============================================

-- Add composite index for leaderboard queries
CREATE INDEX idx_leaderboard ON teams(status, start_time, end_time, hints_used);

-- Add index for recent alerts
CREATE INDEX idx_recent_alerts ON activity_logs(created_at DESC);

-- ============================================
-- NOTES FOR BACKEND IMPLEMENTATION
-- ============================================

-- API Endpoint Examples:

-- GET /api/admin/teams
-- SELECT * FROM v_team_details ORDER BY createdAt DESC;

-- GET /api/admin/stats
-- CALL sp_get_admin_stats();

-- GET /api/admin/alerts
-- SELECT a.id, a.team_id AS teamId, t.team_name AS team, 
--        a.type, a.message, a.severity, a.created_at AS createdAt
-- FROM activity_logs a
-- INNER JOIN teams t ON a.team_id = t.id
-- ORDER BY a.created_at DESC
-- LIMIT 50;

-- GET /api/leaderboard
-- CALL sp_get_leaderboard();

-- PATCH /api/admin/team/:id/action
-- UPDATE teams SET status = ? WHERE id = ?;
-- (Based on action: 'pause', 'resume', 'disqualify', etc.)
