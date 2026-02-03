-- =====================================================
-- LOCKDOWN HQ - FEATURE UPGRADE MIGRATION V2
-- Achievements, Progressive Hints, Puzzle Analytics
-- =====================================================

-- 1️⃣ ACHIEVEMENTS TABLE
CREATE TABLE IF NOT EXISTS achievements (
  id CHAR(36) PRIMARY KEY DEFAULT (UUID()),
  code VARCHAR(50) UNIQUE NOT NULL,
  name VARCHAR(100) NOT NULL,
  description TEXT,
  icon VARCHAR(50) DEFAULT 'trophy',
  points INT DEFAULT 100,
  category ENUM('speed', 'accuracy', 'milestone', 'special') DEFAULT 'milestone',
  trigger_type ENUM('auto', 'manual') DEFAULT 'auto',
  trigger_condition JSON,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_code (code),
  INDEX idx_category (category),
  INDEX idx_active (is_active)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 2️⃣ TEAM ACHIEVEMENTS TABLE
CREATE TABLE IF NOT EXISTS team_achievements (
  id CHAR(36) PRIMARY KEY DEFAULT (UUID()),
  team_id CHAR(36) NOT NULL,
  achievement_id CHAR(36) NOT NULL,
  awarded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  awarded_by CHAR(36),
  metadata JSON,
  FOREIGN KEY (team_id) REFERENCES teams(id) ON DELETE CASCADE,
  FOREIGN KEY (achievement_id) REFERENCES achievements(id) ON DELETE CASCADE,
  FOREIGN KEY (awarded_by) REFERENCES users(id) ON DELETE SET NULL,
  UNIQUE KEY unique_team_achievement (team_id, achievement_id),
  INDEX idx_team (team_id),
  INDEX idx_achievement (achievement_id),
  INDEX idx_awarded_at (awarded_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 3️⃣ PUZZLE ANALYTICS TABLE (aggregated stats)
CREATE TABLE IF NOT EXISTS puzzle_analytics (
  id CHAR(36) PRIMARY KEY DEFAULT (UUID()),
  puzzle_id CHAR(36) NOT NULL,
  total_attempts INT DEFAULT 0,
  successful_attempts INT DEFAULT 0,
  total_time_spent_seconds BIGINT DEFAULT 0,
  hints_requested INT DEFAULT 0,
  avg_solve_time_seconds INT DEFAULT 0,
  min_solve_time_seconds INT DEFAULT 0,
  max_solve_time_seconds INT DEFAULT 0,
  failure_rate DECIMAL(5,2) DEFAULT 0.00,
  hint_usage_rate DECIMAL(5,2) DEFAULT 0.00,
  last_updated TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (puzzle_id) REFERENCES puzzles(id) ON DELETE CASCADE,
  UNIQUE KEY unique_puzzle (puzzle_id),
  INDEX idx_puzzle (puzzle_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 4️⃣ SUSPICIOUS ACTIVITY ALERTS TABLE
CREATE TABLE IF NOT EXISTS suspicious_alerts (
  id CHAR(36) PRIMARY KEY DEFAULT (UUID()),
  team_id CHAR(36) NOT NULL,
  alert_type ENUM('rapid_submission', 'fast_solve', 'tab_switch', 'copy_paste', 'pattern_match') NOT NULL,
  severity ENUM('low', 'medium', 'high', 'critical') DEFAULT 'medium',
  description TEXT,
  metadata JSON,
  is_reviewed BOOLEAN DEFAULT false,
  reviewed_by CHAR(36),
  reviewed_at TIMESTAMP NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (team_id) REFERENCES teams(id) ON DELETE CASCADE,
  FOREIGN KEY (reviewed_by) REFERENCES users(id) ON DELETE SET NULL,
  INDEX idx_team (team_id),
  INDEX idx_type (alert_type),
  INDEX idx_severity (severity),
  INDEX idx_reviewed (is_reviewed),
  INDEX idx_created_at (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 5️⃣ ADD time_limit_seconds TO PUZZLES (if not exists)
ALTER TABLE puzzles 
  ADD COLUMN IF NOT EXISTS time_limit_seconds INT DEFAULT 1800,
  ADD COLUMN IF NOT EXISTS unlock_order INT DEFAULT 1;

-- 6️⃣ ADD progressive hint columns to hints table
ALTER TABLE hints
  ADD COLUMN IF NOT EXISTS unlock_after_seconds INT DEFAULT 0,
  ADD COLUMN IF NOT EXISTS penalty_multiplier DECIMAL(3,2) DEFAULT 1.00;

-- 7️⃣ ADD puzzle_started_at to team_progress
ALTER TABLE team_progress
  ADD COLUMN IF NOT EXISTS puzzle_started_at TIMESTAMP NULL,
  ADD COLUMN IF NOT EXISTS time_expired BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS last_hint_number INT DEFAULT 0;

-- 8️⃣ NOTIFICATIONS TABLE (for in-game notifications)
CREATE TABLE IF NOT EXISTS notifications (
  id CHAR(36) PRIMARY KEY DEFAULT (UUID()),
  team_id CHAR(36),
  user_id CHAR(36),
  notification_type ENUM('broadcast', 'hint_penalty', 'rank_change', 'achievement', 'warning', 'system') NOT NULL,
  title VARCHAR(255) NOT NULL,
  message TEXT,
  priority ENUM('low', 'normal', 'high', 'urgent') DEFAULT 'normal',
  is_read BOOLEAN DEFAULT false,
  read_at TIMESTAMP NULL,
  metadata JSON,
  expires_at TIMESTAMP NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (team_id) REFERENCES teams(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  INDEX idx_team (team_id),
  INDEX idx_user (user_id),
  INDEX idx_type (notification_type),
  INDEX idx_read (is_read),
  INDEX idx_created_at (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 9️⃣ INVENTORY UNLOCK ANIMATIONS TRACKING
ALTER TABLE inventory
  ADD COLUMN IF NOT EXISTS animation_played BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS unlock_animation VARCHAR(50) DEFAULT 'fade-in';

-- 🔟 SEED DEFAULT ACHIEVEMENTS
INSERT INTO achievements (id, code, name, description, icon, points, category, trigger_condition) VALUES
  (UUID(), 'FIRST_BLOOD', 'First Blood', 'First team to solve any puzzle', 'zap', 500, 'special', '{"type": "first_solve"}'),
  (UUID(), 'SPEED_DEMON', 'Speed Demon', 'Solve a puzzle in under 2 minutes', 'clock', 200, 'speed', '{"type": "solve_time", "max_seconds": 120}'),
  (UUID(), 'NO_HINTS', 'Pure Genius', 'Complete a level without using any hints', 'brain', 300, 'accuracy', '{"type": "no_hints_level"}'),
  (UUID(), 'LEVEL_1_COMPLETE', 'Firewall Breached', 'Complete Level 1', 'shield', 100, 'milestone', '{"type": "level_complete", "level": 1}'),
  (UUID(), 'LEVEL_2_COMPLETE', 'Mainframe Access', 'Complete Level 2', 'database', 200, 'milestone', '{"type": "level_complete", "level": 2}'),
  (UUID(), 'PERFECT_RUN', 'Perfect Run', 'Complete the game with 100% accuracy', 'star', 500, 'accuracy', '{"type": "perfect_accuracy"}'),
  (UUID(), 'HINT_MASTER', 'Resourceful', 'Used hints strategically to complete the game', 'lightbulb', 50, 'milestone', '{"type": "used_hints"}'),
  (UUID(), 'SPEEDRUNNER', 'Speedrunner', 'Complete the entire game in under 30 minutes', 'timer', 400, 'speed', '{"type": "total_time", "max_seconds": 1800}'),
  (UUID(), 'COMEBACK_KID', 'Comeback Kid', 'Win after being in last place', 'trending-up', 300, 'special', '{"type": "comeback"}'),
  (UUID(), 'EARLY_BIRD', 'Early Bird', 'First team to start the game', 'sunrise', 100, 'special', '{"type": "first_start"}')
ON DUPLICATE KEY UPDATE code = code;

