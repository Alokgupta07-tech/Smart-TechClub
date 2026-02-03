-- =====================================================
-- LOCKDOWN HQ - COMPLETE GAME DATABASE SCHEMA
-- =====================================================

-- Puzzles Table
CREATE TABLE IF NOT EXISTS puzzles (
  id CHAR(36) PRIMARY KEY DEFAULT (UUID()),
  level INT NOT NULL,
  puzzle_number INT NOT NULL,
  title VARCHAR(255) NOT NULL,
  description TEXT,
  puzzle_type ENUM('text', 'code', 'image', 'qr', 'html', 'cipher', 'mixed') DEFAULT 'text',
  puzzle_content TEXT,
  puzzle_file_url VARCHAR(500),
  correct_answer TEXT NOT NULL,
  points INT DEFAULT 100,
  time_limit_minutes INT DEFAULT 30,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY unique_level_puzzle (level, puzzle_number),
  INDEX idx_level (level),
  INDEX idx_active (is_active)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Hints Table
CREATE TABLE IF NOT EXISTS hints (
  id CHAR(36) PRIMARY KEY DEFAULT (UUID()),
  puzzle_id CHAR(36) NOT NULL,
  hint_number INT NOT NULL,
  hint_text TEXT NOT NULL,
  time_penalty_seconds INT DEFAULT 300,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (puzzle_id) REFERENCES puzzles(id) ON DELETE CASCADE,
  UNIQUE KEY unique_puzzle_hint (puzzle_id, hint_number),
  INDEX idx_puzzle (puzzle_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Submissions Table (tracks all answer attempts)
CREATE TABLE IF NOT EXISTS submissions (
  id CHAR(36) PRIMARY KEY DEFAULT (UUID()),
  team_id CHAR(36) NOT NULL,
  puzzle_id CHAR(36) NOT NULL,
  submitted_answer TEXT NOT NULL,
  is_correct BOOLEAN NOT NULL,
  submitted_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  time_taken_seconds INT,
  FOREIGN KEY (team_id) REFERENCES teams(id) ON DELETE CASCADE,
  FOREIGN KEY (puzzle_id) REFERENCES puzzles(id) ON DELETE CASCADE,
  INDEX idx_team (team_id),
  INDEX idx_puzzle (puzzle_id),
  INDEX idx_correct (is_correct),
  INDEX idx_submitted_at (submitted_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Team Progress Table (tracks current puzzle progress)
CREATE TABLE IF NOT EXISTS team_progress (
  id CHAR(36) PRIMARY KEY DEFAULT (UUID()),
  team_id CHAR(36) NOT NULL,
  puzzle_id CHAR(36) NOT NULL,
  current_level INT NOT NULL DEFAULT 1,
  current_puzzle INT NOT NULL DEFAULT 1,
  is_completed BOOLEAN DEFAULT false,
  started_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  completed_at TIMESTAMP NULL,
  hints_used INT DEFAULT 0,
  attempts INT DEFAULT 0,
  FOREIGN KEY (team_id) REFERENCES teams(id) ON DELETE CASCADE,
  FOREIGN KEY (puzzle_id) REFERENCES puzzles(id) ON DELETE CASCADE,
  UNIQUE KEY unique_team_puzzle (team_id, puzzle_id),
  INDEX idx_team (team_id),
  INDEX idx_level (current_level),
  INDEX idx_completed (is_completed)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Hint Usage Table (tracks which hints were used by teams)
CREATE TABLE IF NOT EXISTS hint_usage (
  id CHAR(36) PRIMARY KEY DEFAULT (UUID()),
  team_id CHAR(36) NOT NULL,
  hint_id CHAR(36) NOT NULL,
  puzzle_id CHAR(36) NOT NULL,
  used_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  time_penalty_applied INT DEFAULT 0,
  FOREIGN KEY (team_id) REFERENCES teams(id) ON DELETE CASCADE,
  FOREIGN KEY (hint_id) REFERENCES hints(id) ON DELETE CASCADE,
  FOREIGN KEY (puzzle_id) REFERENCES puzzles(id) ON DELETE CASCADE,
  UNIQUE KEY unique_team_hint (team_id, hint_id),
  INDEX idx_team (team_id),
  INDEX idx_puzzle (puzzle_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Inventory Table (digital clues and keys)
CREATE TABLE IF NOT EXISTS inventory (
  id CHAR(36) PRIMARY KEY DEFAULT (UUID()),
  team_id CHAR(36) NOT NULL,
  item_type ENUM('clue', 'key', 'code', 'data', 'intelligence') DEFAULT 'clue',
  item_name VARCHAR(255) NOT NULL,
  item_value TEXT,
  collected_from_puzzle CHAR(36),
  collected_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  is_used BOOLEAN DEFAULT false,
  FOREIGN KEY (team_id) REFERENCES teams(id) ON DELETE CASCADE,
  FOREIGN KEY (collected_from_puzzle) REFERENCES puzzles(id) ON DELETE SET NULL,
  INDEX idx_team (team_id),
  INDEX idx_type (item_type),
  INDEX idx_used (is_used)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Game State Table (controls game flow)
CREATE TABLE IF NOT EXISTS game_state (
  id CHAR(36) PRIMARY KEY DEFAULT (UUID()),
  game_name VARCHAR(255) DEFAULT 'Lockdown HQ Event',
  current_phase ENUM('not_started', 'level_1', 'level_2', 'completed') DEFAULT 'not_started',
  level_1_unlocked BOOLEAN DEFAULT false,
  level_2_unlocked BOOLEAN DEFAULT false,
  game_started_at TIMESTAMP NULL,
  game_ended_at TIMESTAMP NULL,
  is_paused BOOLEAN DEFAULT false,
  max_teams INT DEFAULT 50,
  time_limit_minutes INT DEFAULT 180,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Activity Logs Table (enhanced for system logs feed)
CREATE TABLE IF NOT EXISTS activity_logs (
  id CHAR(36) PRIMARY KEY DEFAULT (UUID()),
  team_id CHAR(36),
  user_id CHAR(36),
  action_type ENUM('login', 'logout', 'puzzle_start', 'puzzle_solve', 'puzzle_fail', 'hint_use', 'level_complete', 'tab_switch', 'suspicious_activity') NOT NULL,
  description TEXT,
  puzzle_id CHAR(36),
  metadata JSON,
  ip_address VARCHAR(45),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (team_id) REFERENCES teams(id) ON DELETE SET NULL,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL,
  FOREIGN KEY (puzzle_id) REFERENCES puzzles(id) ON DELETE SET NULL,
  INDEX idx_team (team_id),
  INDEX idx_action (action_type),
  INDEX idx_created_at (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Sessions Table (for multi-login detection)
CREATE TABLE IF NOT EXISTS sessions (
  id CHAR(36) PRIMARY KEY DEFAULT (UUID()),
  team_id CHAR(36) NOT NULL,
  user_id CHAR(36) NOT NULL,
  session_token VARCHAR(500) NOT NULL,
  ip_address VARCHAR(45),
  user_agent TEXT,
  is_active BOOLEAN DEFAULT true,
  last_activity TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  expires_at TIMESTAMP NOT NULL,
  FOREIGN KEY (team_id) REFERENCES teams(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  INDEX idx_team (team_id),
  INDEX idx_token (session_token(255)),
  INDEX idx_active (is_active),
  INDEX idx_expires (expires_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Broadcast Messages Table
CREATE TABLE IF NOT EXISTS broadcast_messages (
  id CHAR(36) PRIMARY KEY DEFAULT (UUID()),
  message TEXT NOT NULL,
  message_type ENUM('info', 'warning', 'alert', 'success') DEFAULT 'info',
  sent_by CHAR(36),
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  expires_at TIMESTAMP NULL,
  FOREIGN KEY (sent_by) REFERENCES users(id) ON DELETE SET NULL,
  INDEX idx_active (is_active),
  INDEX idx_expires (expires_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Initialize default game state
INSERT INTO game_state (game_name, current_phase, level_1_unlocked, level_2_unlocked)
VALUES ('Lockdown HQ Event 2026', 'not_started', false, false)
ON DUPLICATE KEY UPDATE id=id;
