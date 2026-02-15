-- =====================================================
-- LOCKDOWN HQ - TIME TRACKING & SKIP FUNCTIONALITY
-- Complete Database Schema for Per-Team Time Tracking
-- =====================================================

-- 1️⃣ TEAM QUESTION PROGRESS TABLE
-- Tracks individual question progress with accurate time tracking
CREATE TABLE IF NOT EXISTS team_question_progress (
  id CHAR(36) PRIMARY KEY DEFAULT (UUID()),
  team_id CHAR(36) NOT NULL,
  puzzle_id CHAR(36) NOT NULL,
  
  -- Time tracking fields
  started_at TIMESTAMP NULL,              -- When current session started (NULL = paused)
  ended_at TIMESTAMP NULL,                -- When question was completed
  time_spent_seconds INT DEFAULT 0,       -- Accumulated time (updates on pause/complete)
  
  -- Status tracking
  status ENUM('not_started', 'active', 'paused', 'skipped', 'completed') DEFAULT 'not_started',
  
  -- Skip tracking 
  skip_count INT DEFAULT 0,               -- How many times this question was skipped
  last_skipped_at TIMESTAMP NULL,         -- When it was last skipped
  
  -- Attempt tracking
  attempts INT DEFAULT 0,                 -- Number of answer attempts
  hints_used INT DEFAULT 0,               -- Hints used for this question
  
  -- Penalty tracking
  time_penalty_seconds INT DEFAULT 0,     -- Accumulated penalties (hints + skips)
  
  -- Metadata
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  
  FOREIGN KEY (team_id) REFERENCES teams(id) ON DELETE CASCADE,
  FOREIGN KEY (puzzle_id) REFERENCES puzzles(id) ON DELETE CASCADE,
  UNIQUE KEY unique_team_puzzle_progress (team_id, puzzle_id),
  INDEX idx_team_status (team_id, status),
  INDEX idx_puzzle (puzzle_id),
  INDEX idx_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


-- 2️⃣ TEAM SESSIONS TABLE
-- Tracks overall game sessions for each team
CREATE TABLE IF NOT EXISTS team_sessions (
  id CHAR(36) PRIMARY KEY DEFAULT (UUID()),
  team_id CHAR(36) NOT NULL,
  
  -- Session timing
  session_start TIMESTAMP NULL,           -- When team started playing
  session_end TIMESTAMP NULL,             -- When team finished (game end or completed)
  
  -- Accumulated totals
  total_time_seconds INT DEFAULT 0,       -- Total time spent solving (excluding pauses)
  total_penalty_seconds INT DEFAULT 0,    -- Total penalties accumulated
  effective_time_seconds INT DEFAULT 0,   -- total_time + penalties (for ranking)
  
  -- Progress stats
  questions_completed INT DEFAULT 0,
  questions_skipped INT DEFAULT 0,
  total_attempts INT DEFAULT 0,
  total_hints_used INT DEFAULT 0,
  
  -- Session state
  is_active BOOLEAN DEFAULT true,
  
  -- Metadata
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  
  FOREIGN KEY (team_id) REFERENCES teams(id) ON DELETE CASCADE,
  INDEX idx_team (team_id),
  INDEX idx_active (is_active),
  INDEX idx_effective_time (effective_time_seconds)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


-- 3️⃣ TIME TRACKING EVENTS TABLE
-- Audit log for all time-related events (for debugging and admin visibility)
CREATE TABLE IF NOT EXISTS time_tracking_events (
  id CHAR(36) PRIMARY KEY DEFAULT (UUID()),
  team_id CHAR(36) NOT NULL,
  puzzle_id CHAR(36),
  
  -- Event details
  event_type ENUM(
    'question_start',
    'question_pause', 
    'question_resume',
    'question_complete',
    'question_skip',
    'hint_used',
    'session_start',
    'session_pause',
    'session_resume',
    'session_end',
    'admin_time_adjust'
  ) NOT NULL,
  
  -- Time snapshot at event
  time_spent_at_event INT DEFAULT 0,      -- Accumulated time when event occurred
  
  -- Event metadata
  details JSON,                            -- Additional context
  triggered_by CHAR(36),                   -- User who triggered (admin or team user)
  ip_address VARCHAR(45),
  
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  
  FOREIGN KEY (team_id) REFERENCES teams(id) ON DELETE CASCADE,
  FOREIGN KEY (puzzle_id) REFERENCES puzzles(id) ON DELETE SET NULL,
  INDEX idx_team (team_id),
  INDEX idx_puzzle (puzzle_id),
  INDEX idx_event_type (event_type),
  INDEX idx_created (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


-- 4️⃣ GAME SETTINGS TABLE
-- Admin-configurable settings for skip/time penalties
CREATE TABLE IF NOT EXISTS game_settings (
  id INT PRIMARY KEY DEFAULT 1,
  
  -- Skip settings
  skip_enabled BOOLEAN DEFAULT true,
  max_skips_per_team INT DEFAULT 3,
  skip_penalty_seconds INT DEFAULT 60,    -- Penalty per skip (in seconds)
  
  -- Hint settings  
  hint_penalty_seconds INT DEFAULT 30,    -- Penalty per hint used
  max_hints_per_question INT DEFAULT 2,
  
  -- Time settings
  question_time_limit_seconds INT DEFAULT 240,  -- 4 min default per question
  total_game_time_limit_seconds INT DEFAULT 7200, -- 2 hour total game limit
  
  -- Ranking settings
  rank_by ENUM('completion_time', 'score', 'combined') DEFAULT 'completion_time',
  
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  updated_by CHAR(36)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Insert default settings
INSERT INTO game_settings (id, skip_enabled, max_skips_per_team, skip_penalty_seconds)
VALUES (1, true, 3, 60)
ON DUPLICATE KEY UPDATE id = id;


-- 5️⃣ Add columns to existing teams table
ALTER TABLE teams
  ADD COLUMN IF NOT EXISTS total_time_seconds INT DEFAULT 0,
  ADD COLUMN IF NOT EXISTS total_penalty_seconds INT DEFAULT 0,
  ADD COLUMN IF NOT EXISTS questions_completed INT DEFAULT 0,
  ADD COLUMN IF NOT EXISTS questions_skipped INT DEFAULT 0,
  ADD COLUMN IF NOT EXISTS current_puzzle_id CHAR(36),
  ADD COLUMN IF NOT EXISTS game_status ENUM('not_started', 'playing', 'paused', 'completed') DEFAULT 'not_started';


-- 6️⃣ Create view for admin dashboard - Team Rankings with Time
CREATE OR REPLACE VIEW team_rankings AS
SELECT 
  t.id,
  t.team_name,
  t.status,
  t.game_status,
  t.questions_completed,
  t.questions_skipped,
  COALESCE(ts.total_time_seconds, 0) as total_time_seconds,
  COALESCE(ts.total_penalty_seconds, 0) as total_penalty_seconds,
  COALESCE(ts.effective_time_seconds, 0) as effective_time_seconds,
  COALESCE(ts.total_attempts, 0) as total_attempts,
  COALESCE(ts.total_hints_used, 0) as total_hints_used,
  
  -- Calculate average time per question
  CASE 
    WHEN t.questions_completed > 0 
    THEN ROUND(COALESCE(ts.total_time_seconds, 0) / t.questions_completed)
    ELSE 0 
  END as avg_time_per_question,
  
  -- Rank by effective time (lower is better)
  RANK() OVER (ORDER BY 
    CASE WHEN t.status = 'completed' THEN 0 ELSE 1 END,
    t.questions_completed DESC,
    COALESCE(ts.effective_time_seconds, 999999) ASC
  ) as ranking
  
FROM teams t
LEFT JOIN team_sessions ts ON t.id = ts.team_id AND ts.is_active = true
WHERE t.status != 'disqualified'
ORDER BY ranking;


-- 7️⃣ Create view for question-level analytics
CREATE OR REPLACE VIEW question_analytics AS
SELECT 
  p.id as puzzle_id,
  p.title as puzzle_title,
  p.level,
  p.puzzle_number,
  COUNT(tqp.id) as total_attempts_by_teams,
  SUM(CASE WHEN tqp.status = 'completed' THEN 1 ELSE 0 END) as completions,
  SUM(CASE WHEN tqp.status = 'skipped' THEN 1 ELSE 0 END) as skips,
  ROUND(AVG(CASE WHEN tqp.status = 'completed' THEN tqp.time_spent_seconds ELSE NULL END)) as avg_solve_time,
  MIN(CASE WHEN tqp.status = 'completed' THEN tqp.time_spent_seconds ELSE NULL END) as fastest_solve,
  MAX(CASE WHEN tqp.status = 'completed' THEN tqp.time_spent_seconds ELSE NULL END) as slowest_solve,
  ROUND(AVG(tqp.attempts)) as avg_attempts,
  ROUND(AVG(tqp.hints_used)) as avg_hints_used
FROM puzzles p
LEFT JOIN team_question_progress tqp ON p.id = tqp.puzzle_id
GROUP BY p.id, p.title, p.level, p.puzzle_number
ORDER BY p.level, p.puzzle_number;
