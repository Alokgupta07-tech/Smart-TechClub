-- =====================================================
-- LOCKDOWN HQ - TIME TRACKING & SKIP FUNCTIONALITY
-- Migration V1: Per-Team Accurate Time Tracking
-- =====================================================

-- 1️⃣ TEAM QUESTION PROGRESS TABLE
-- Tracks exact time taken per question per team with pause/resume support
CREATE TABLE IF NOT EXISTS team_question_progress (
  id CHAR(36) PRIMARY KEY DEFAULT (UUID()),
  team_id CHAR(36) NOT NULL,
  puzzle_id CHAR(36) NOT NULL,
  
  -- Time tracking fields
  started_at TIMESTAMP NULL,                              -- When team started/resumed this question
  ended_at TIMESTAMP NULL,                                -- When team completed this question
  time_spent_seconds INT DEFAULT 0,                       -- Accumulated time (handles pause/resume)
  
  -- Status tracking
  status ENUM('not_started', 'active', 'paused', 'skipped', 'completed') DEFAULT 'not_started',
  
  -- Skip tracking
  skip_count INT DEFAULT 0,                               -- How many times this question was skipped
  skip_penalty_seconds INT DEFAULT 0,                     -- Total penalty applied for skips
  
  -- Timestamps
  first_started_at TIMESTAMP NULL,                        -- Very first time question was started
  last_paused_at TIMESTAMP NULL,                          -- Last time question was paused
  last_resumed_at TIMESTAMP NULL,                         -- Last time question was resumed
  
  -- Metadata
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  
  FOREIGN KEY (team_id) REFERENCES teams(id) ON DELETE CASCADE,
  FOREIGN KEY (puzzle_id) REFERENCES puzzles(id) ON DELETE CASCADE,
  UNIQUE KEY unique_team_puzzle_progress (team_id, puzzle_id),
  INDEX idx_team (team_id),
  INDEX idx_puzzle (puzzle_id),
  INDEX idx_status (status),
  INDEX idx_started_at (started_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


-- 2️⃣ TEAM SESSIONS TABLE
-- Tracks overall game session time per team
CREATE TABLE IF NOT EXISTS team_sessions (
  id CHAR(36) PRIMARY KEY DEFAULT (UUID()),
  team_id CHAR(36) NOT NULL,
  
  -- Session time tracking
  session_start TIMESTAMP NULL,                           -- When team started the game
  session_end TIMESTAMP NULL,                             -- When team finished/ended
  total_time_seconds INT DEFAULT 0,                       -- Total accumulated play time
  active_time_seconds INT DEFAULT 0,                      -- Time actively solving (excludes pauses)
  
  -- Session state
  status ENUM('not_started', 'active', 'paused', 'completed', 'terminated') DEFAULT 'not_started',
  pause_count INT DEFAULT 0,                              -- Number of times session was paused
  total_pause_time_seconds INT DEFAULT 0,                 -- Total time spent in paused state
  
  -- Statistics
  questions_completed INT DEFAULT 0,
  questions_skipped INT DEFAULT 0,
  total_skip_penalty_seconds INT DEFAULT 0,
  total_hint_penalty_seconds INT DEFAULT 0,
  
  -- Timestamps
  last_activity_at TIMESTAMP NULL,                        -- Last recorded activity
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  
  FOREIGN KEY (team_id) REFERENCES teams(id) ON DELETE CASCADE,
  UNIQUE KEY unique_team_session (team_id),
  INDEX idx_team (team_id),
  INDEX idx_status (status),
  INDEX idx_session_start (session_start)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


-- 3️⃣ GAME SETTINGS TABLE
-- Admin-controlled settings for skip functionality and time tracking
CREATE TABLE IF NOT EXISTS game_settings (
  id CHAR(36) PRIMARY KEY DEFAULT (UUID()),
  setting_key VARCHAR(100) UNIQUE NOT NULL,
  setting_value TEXT NOT NULL,
  setting_type ENUM('boolean', 'integer', 'string', 'json') DEFAULT 'string',
  description TEXT,
  updated_by CHAR(36),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  
  FOREIGN KEY (updated_by) REFERENCES users(id) ON DELETE SET NULL,
  INDEX idx_key (setting_key)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Insert default settings
INSERT INTO game_settings (id, setting_key, setting_value, setting_type, description) VALUES
  (UUID(), 'skip_enabled', 'true', 'boolean', 'Allow teams to skip questions'),
  (UUID(), 'max_skips_per_team', '3', 'integer', 'Maximum number of skips allowed per team'),
  (UUID(), 'skip_penalty_seconds', '300', 'integer', 'Time penalty in seconds per skip (5 minutes)'),
  (UUID(), 'allow_skip_return', 'true', 'boolean', 'Allow teams to return to skipped questions'),
  (UUID(), 'auto_pause_on_disconnect', 'true', 'boolean', 'Auto-pause timer when team disconnects'),
  (UUID(), 'leaderboard_update_interval', '10', 'integer', 'Leaderboard refresh interval in seconds')
ON DUPLICATE KEY UPDATE setting_value = VALUES(setting_value);


-- 4️⃣ TIME TRACKING EVENTS TABLE
-- Detailed audit log for all time-related events
CREATE TABLE IF NOT EXISTS time_tracking_events (
  id CHAR(36) PRIMARY KEY DEFAULT (UUID()),
  team_id CHAR(36) NOT NULL,
  puzzle_id CHAR(36),
  
  event_type ENUM(
    'session_start', 'session_pause', 'session_resume', 'session_end',
    'question_start', 'question_pause', 'question_resume', 'question_complete',
    'question_skip', 'question_unskip', 'timer_sync', 'penalty_applied'
  ) NOT NULL,
  
  -- Event details
  time_before_event_seconds INT DEFAULT 0,                -- Time accumulated before this event
  time_after_event_seconds INT DEFAULT 0,                 -- Time after this event
  time_delta_seconds INT DEFAULT 0,                       -- Difference (for calculations)
  
  -- Metadata
  metadata JSON,                                          -- Additional event-specific data
  ip_address VARCHAR(45),
  user_agent VARCHAR(500),
  
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  
  FOREIGN KEY (team_id) REFERENCES teams(id) ON DELETE CASCADE,
  FOREIGN KEY (puzzle_id) REFERENCES puzzles(id) ON DELETE SET NULL,
  INDEX idx_team (team_id),
  INDEX idx_puzzle (puzzle_id),
  INDEX idx_event_type (event_type),
  INDEX idx_created_at (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


-- 5️⃣ MODIFY TEAMS TABLE - Add pause tracking
ALTER TABLE teams
  ADD COLUMN IF NOT EXISTS is_paused BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS paused_at TIMESTAMP NULL,
  ADD COLUMN IF NOT EXISTS total_pause_duration_seconds INT DEFAULT 0,
  ADD COLUMN IF NOT EXISTS current_puzzle_id CHAR(36),
  ADD COLUMN IF NOT EXISTS effective_time_seconds INT DEFAULT 0;

-- Add foreign key for current_puzzle_id (wrapped in procedure to handle errors)
-- Note: Run manually if this fails due to existing constraint
-- ALTER TABLE teams ADD CONSTRAINT fk_teams_current_puzzle FOREIGN KEY (current_puzzle_id) REFERENCES puzzles(id) ON DELETE SET NULL;


-- 6️⃣ MODIFY TEAM_PROGRESS TABLE - Enhanced time tracking
ALTER TABLE team_progress
  ADD COLUMN IF NOT EXISTS time_spent_seconds INT DEFAULT 0,
  ADD COLUMN IF NOT EXISTS paused_at TIMESTAMP NULL,
  ADD COLUMN IF NOT EXISTS status ENUM('not_started', 'active', 'paused', 'skipped', 'completed') DEFAULT 'not_started',
  ADD COLUMN IF NOT EXISTS skip_count INT DEFAULT 0,
  ADD COLUMN IF NOT EXISTS first_started_at TIMESTAMP NULL;


-- 7️⃣ CREATE VIEW FOR TEAM TIME ANALYTICS
CREATE OR REPLACE VIEW team_time_analytics AS
SELECT 
  t.id AS team_id,
  t.team_name,
  t.status AS team_status,
  ts.total_time_seconds,
  ts.active_time_seconds,
  ts.questions_completed,
  ts.questions_skipped,
  ts.total_skip_penalty_seconds,
  ts.total_hint_penalty_seconds,
  (ts.active_time_seconds + ts.total_skip_penalty_seconds + ts.total_hint_penalty_seconds) AS effective_time_seconds,
  ts.session_start,
  ts.session_end,
  COUNT(DISTINCT tqp.puzzle_id) AS puzzles_attempted,
  AVG(CASE WHEN tqp.status = 'completed' THEN tqp.time_spent_seconds ELSE NULL END) AS avg_solve_time_seconds,
  MIN(CASE WHEN tqp.status = 'completed' THEN tqp.time_spent_seconds ELSE NULL END) AS fastest_solve_seconds,
  MAX(CASE WHEN tqp.status = 'completed' THEN tqp.time_spent_seconds ELSE NULL END) AS slowest_solve_seconds
FROM teams t
LEFT JOIN team_sessions ts ON t.id = ts.team_id
LEFT JOIN team_question_progress tqp ON t.id = tqp.team_id
GROUP BY t.id, t.team_name, t.status, ts.total_time_seconds, ts.active_time_seconds,
         ts.questions_completed, ts.questions_skipped, ts.total_skip_penalty_seconds,
         ts.total_hint_penalty_seconds, ts.session_start, ts.session_end;


-- 8️⃣ CREATE VIEW FOR PUZZLE TIME ANALYTICS
CREATE OR REPLACE VIEW puzzle_time_analytics AS
SELECT 
  p.id AS puzzle_id,
  p.title AS puzzle_title,
  p.level,
  p.puzzle_number,
  COUNT(DISTINCT tqp.team_id) AS teams_attempted,
  SUM(CASE WHEN tqp.status = 'completed' THEN 1 ELSE 0 END) AS teams_completed,
  SUM(CASE WHEN tqp.status = 'skipped' THEN 1 ELSE 0 END) AS teams_skipped,
  AVG(CASE WHEN tqp.status = 'completed' THEN tqp.time_spent_seconds ELSE NULL END) AS avg_solve_time,
  MIN(CASE WHEN tqp.status = 'completed' THEN tqp.time_spent_seconds ELSE NULL END) AS fastest_solve,
  MAX(CASE WHEN tqp.status = 'completed' THEN tqp.time_spent_seconds ELSE NULL END) AS slowest_solve,
  SUM(tqp.skip_count) AS total_skips
FROM puzzles p
LEFT JOIN team_question_progress tqp ON p.id = tqp.puzzle_id
GROUP BY p.id, p.title, p.level, p.puzzle_number;


-- 9️⃣ STORED PROCEDURE: Calculate team effective time
DELIMITER //

CREATE PROCEDURE IF NOT EXISTS calculate_team_effective_time(IN p_team_id CHAR(36))
BEGIN
  DECLARE v_total_time INT DEFAULT 0;
  DECLARE v_skip_penalty INT DEFAULT 0;
  DECLARE v_hint_penalty INT DEFAULT 0;
  
  -- Get total time from all completed questions
  SELECT COALESCE(SUM(time_spent_seconds), 0) INTO v_total_time
  FROM team_question_progress
  WHERE team_id = p_team_id;
  
  -- Get skip penalties
  SELECT COALESCE(SUM(skip_penalty_seconds), 0) INTO v_skip_penalty
  FROM team_question_progress
  WHERE team_id = p_team_id;
  
  -- Get hint penalties from hint_usage
  SELECT COALESCE(SUM(time_penalty_applied), 0) INTO v_hint_penalty
  FROM hint_usage
  WHERE team_id = p_team_id;
  
  -- Update team session
  UPDATE team_sessions
  SET active_time_seconds = v_total_time,
      total_skip_penalty_seconds = v_skip_penalty,
      total_hint_penalty_seconds = v_hint_penalty,
      updated_at = NOW()
  WHERE team_id = p_team_id;
  
  -- Update team's effective time
  UPDATE teams
  SET effective_time_seconds = v_total_time + v_skip_penalty + v_hint_penalty
  WHERE id = p_team_id;
END //

DELIMITER ;


-- 🔟 INDEXES FOR PERFORMANCE
CREATE INDEX IF NOT EXISTS idx_tqp_team_status ON team_question_progress(team_id, status);
CREATE INDEX IF NOT EXISTS idx_tqp_puzzle_status ON team_question_progress(puzzle_id, status);
CREATE INDEX IF NOT EXISTS idx_ts_status_start ON team_sessions(status, session_start);
CREATE INDEX IF NOT EXISTS idx_tte_team_created ON time_tracking_events(team_id, created_at);

-- =====================================================
-- END OF MIGRATION
-- =====================================================
