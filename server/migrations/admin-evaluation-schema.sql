-- =====================================================
-- LOCKDOWN HQ - ADMIN-CONTROLLED EVALUATION SYSTEM
-- Migration for Manual Evaluation & Result Release
-- =====================================================
-- Run this migration to add admin-controlled evaluation features
-- Does NOT modify existing tables destructively - only adds new columns/tables

-- =====================================================
-- 1️⃣ LEVEL EVALUATION STATE TABLE
-- Tracks per-level evaluation status (admin-controlled)
-- =====================================================
CREATE TABLE IF NOT EXISTS level_evaluation_state (
  id CHAR(36) PRIMARY KEY DEFAULT (UUID()),
  level_id INT NOT NULL UNIQUE,                    -- 1 = Level 1, 2 = Level 2
  
  -- Evaluation State (controlled by admin)
  evaluation_state ENUM(
    'IN_PROGRESS',          -- Teams can submit answers
    'SUBMISSIONS_CLOSED',   -- No more submissions allowed
    'EVALUATING',           -- Admin is evaluating answers
    'RESULTS_PUBLISHED'     -- Results visible to teams
  ) DEFAULT 'IN_PROGRESS',
  
  -- Timestamps
  submissions_closed_at TIMESTAMP NULL,    -- When admin closed submissions
  evaluation_started_at TIMESTAMP NULL,    -- When admin started evaluation
  evaluated_at TIMESTAMP NULL,             -- When evaluation completed
  results_published_at TIMESTAMP NULL,     -- When results became visible
  
  -- Admin tracking
  closed_by CHAR(36) NULL,                 -- Admin who closed submissions
  evaluated_by CHAR(36) NULL,              -- Admin who ran evaluation
  published_by CHAR(36) NULL,              -- Admin who published results
  
  -- Metadata
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  
  INDEX idx_level (level_id),
  INDEX idx_state (evaluation_state)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


-- =====================================================
-- 2️⃣ ADD EVALUATION FIELDS TO SUBMISSIONS TABLE
-- Track whether each submission has been evaluated
-- =====================================================
-- Add evaluation_status column if not exists
SET @db_name = DATABASE();
SET @table_name = 'submissions';
SET @column_name = 'evaluation_status';

SET @column_exists = (
  SELECT COUNT(*) FROM information_schema.columns 
  WHERE table_schema = @db_name 
    AND table_name = @table_name 
    AND column_name = @column_name
);

SET @sql = IF(@column_exists = 0,
  'ALTER TABLE submissions ADD COLUMN evaluation_status ENUM(''PENDING'', ''EVALUATED'') DEFAULT ''PENDING''',
  'SELECT ''Column evaluation_status already exists'' AS message'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- Add score_awarded column if not exists
SET @column_name = 'score_awarded';
SET @column_exists = (
  SELECT COUNT(*) FROM information_schema.columns 
  WHERE table_schema = @db_name 
    AND table_name = @table_name 
    AND column_name = @column_name
);

SET @sql = IF(@column_exists = 0,
  'ALTER TABLE submissions ADD COLUMN score_awarded INT DEFAULT 0',
  'SELECT ''Column score_awarded already exists'' AS message'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- Add evaluated_at column if not exists
SET @column_name = 'evaluated_at';
SET @column_exists = (
  SELECT COUNT(*) FROM information_schema.columns 
  WHERE table_schema = @db_name 
    AND table_name = @table_name 
    AND column_name = @column_name
);

SET @sql = IF(@column_exists = 0,
  'ALTER TABLE submissions ADD COLUMN evaluated_at TIMESTAMP NULL',
  'SELECT ''Column evaluated_at already exists'' AS message'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- Add index on evaluation_status
CREATE INDEX IF NOT EXISTS idx_evaluation_status ON submissions(evaluation_status);


-- =====================================================
-- 3️⃣ ADD RESULT VISIBILITY FIELD TO TEAM_LEVEL_STATUS
-- =====================================================
SET @table_name = 'team_level_status';
SET @column_name = 'results_visible';

SET @column_exists = (
  SELECT COUNT(*) FROM information_schema.columns 
  WHERE table_schema = @db_name 
    AND table_name = @table_name 
    AND column_name = @column_name
);

SET @sql = IF(@column_exists = 0,
  'ALTER TABLE team_level_status ADD COLUMN results_visible BOOLEAN DEFAULT false',
  'SELECT ''Column results_visible already exists'' AS message'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;


-- =====================================================
-- 4️⃣ EVALUATION AUDIT LOG TABLE
-- Track all evaluation-related admin actions
-- =====================================================
CREATE TABLE IF NOT EXISTS evaluation_audit_log (
  id CHAR(36) PRIMARY KEY DEFAULT (UUID()),
  level_id INT NOT NULL,
  
  -- Action Details
  action ENUM(
    'SUBMISSIONS_CLOSED',
    'SUBMISSIONS_REOPENED',
    'EVALUATION_STARTED',
    'EVALUATION_COMPLETED',
    'RESULTS_PUBLISHED',
    'RESULTS_UNPUBLISHED'
  ) NOT NULL,
  
  -- Actor
  admin_id CHAR(36) NOT NULL,
  admin_name VARCHAR(100),
  
  -- Stats snapshot at time of action
  teams_evaluated INT DEFAULT 0,
  submissions_evaluated INT DEFAULT 0,
  
  -- Additional details
  details JSON NULL,
  
  -- Metadata
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  
  INDEX idx_level (level_id),
  INDEX idx_action (action),
  INDEX idx_admin (admin_id),
  INDEX idx_created_at (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


-- =====================================================
-- 5️⃣ INITIALIZE DEFAULT LEVEL EVALUATION STATES
-- =====================================================
INSERT INTO level_evaluation_state (id, level_id, evaluation_state)
VALUES 
  (UUID(), 1, 'IN_PROGRESS'),
  (UUID(), 2, 'IN_PROGRESS')
ON DUPLICATE KEY UPDATE updated_at = CURRENT_TIMESTAMP;


-- =====================================================
-- 6️⃣ VIEW: Level Evaluation Summary
-- =====================================================
CREATE OR REPLACE VIEW v_level_evaluation_summary AS
SELECT 
  les.level_id,
  les.evaluation_state,
  les.submissions_closed_at,
  les.evaluated_at,
  les.results_published_at,
  
  -- Submission counts
  (SELECT COUNT(*) FROM submissions s 
   JOIN puzzles p ON s.puzzle_id = p.id 
   WHERE p.level = les.level_id) as total_submissions,
  
  (SELECT COUNT(*) FROM submissions s 
   JOIN puzzles p ON s.puzzle_id = p.id 
   WHERE p.level = les.level_id AND s.evaluation_status = 'EVALUATED') as evaluated_submissions,
  
  -- Team counts  
  (SELECT COUNT(DISTINCT s.team_id) FROM submissions s 
   JOIN puzzles p ON s.puzzle_id = p.id 
   WHERE p.level = les.level_id) as teams_with_submissions,
  
  -- Qualification summary (only meaningful after evaluation)
  (SELECT COUNT(*) FROM team_level_status tls 
   WHERE tls.level_id = les.level_id AND tls.qualification_status = 'QUALIFIED') as qualified_teams,
  
  (SELECT COUNT(*) FROM team_level_status tls 
   WHERE tls.level_id = les.level_id AND tls.qualification_status = 'DISQUALIFIED') as disqualified_teams,
  
  (SELECT COUNT(*) FROM team_level_status tls 
   WHERE tls.level_id = les.level_id AND tls.qualification_status = 'PENDING') as pending_teams

FROM level_evaluation_state les;


-- =====================================================
-- NOTES FOR BACKEND IMPLEMENTATION
-- =====================================================
-- 
-- NEW ENDPOINTS TO CREATE:
-- POST /api/admin/level/:levelId/close-submissions
-- POST /api/admin/level/:levelId/evaluate
-- POST /api/admin/level/:levelId/publish-results
-- GET  /api/admin/level/:levelId/evaluation-status
--
-- MODIFIED LOGIC:
-- 1. Team answer submission: Check evaluation_state before accepting
-- 2. Result APIs: Check evaluation_state before returning results
-- 3. Qualification: Only visible after RESULTS_PUBLISHED
-- 4. Level 2 access: Only if Level 1 results published AND qualified
--
-- =====================================================
