-- =====================================================
-- LOCKDOWN HQ - LEVEL QUALIFICATION SYSTEM
-- Migration for Level-Wise Game Activation & Qualification
-- =====================================================
-- Run this migration to add level qualification features
-- Does NOT modify existing tables - only adds new ones

-- 1️⃣ TEAM LEVEL STATUS TABLE
-- Tracks team's status for each level (NOT_STARTED, IN_PROGRESS, COMPLETED)
-- and their qualification result (PENDING, QUALIFIED, DISQUALIFIED)
CREATE TABLE IF NOT EXISTS team_level_status (
  id CHAR(36) PRIMARY KEY DEFAULT (UUID()),
  team_id CHAR(36) NOT NULL,
  level_id INT NOT NULL,                           -- 1 = Level 1, 2 = Level 2
  
  -- Progress Status
  status ENUM('NOT_STARTED', 'IN_PROGRESS', 'COMPLETED') DEFAULT 'NOT_STARTED',
  
  -- Qualification Status (only applies after level completion)
  qualification_status ENUM('PENDING', 'QUALIFIED', 'DISQUALIFIED') DEFAULT 'PENDING',
  
  -- Performance Metrics
  score INT DEFAULT 0,                             -- Total points earned in this level
  questions_answered INT DEFAULT 0,                -- Number of questions attempted
  questions_correct INT DEFAULT 0,                 -- Number of correct answers
  accuracy DECIMAL(5,2) DEFAULT 0.00,              -- Accuracy percentage (0-100)
  time_taken_seconds INT DEFAULT 0,                -- Total time spent on this level
  hints_used INT DEFAULT 0,                        -- Total hints used in this level
  
  -- Timestamps
  started_at TIMESTAMP NULL,                       -- When team started this level
  completed_at TIMESTAMP NULL,                     -- When team finished this level
  qualification_decided_at TIMESTAMP NULL,         -- When qualification was determined
  
  -- Admin Override tracking
  was_manually_overridden BOOLEAN DEFAULT false,   -- If admin manually changed status
  override_by CHAR(36) NULL,                       -- Admin who made the override
  override_reason VARCHAR(255) NULL,               -- Reason for manual override
  override_at TIMESTAMP NULL,                      -- When override was made
  
  -- Metadata
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  
  FOREIGN KEY (team_id) REFERENCES teams(id) ON DELETE CASCADE,
  UNIQUE KEY unique_team_level (team_id, level_id),
  INDEX idx_team (team_id),
  INDEX idx_level (level_id),
  INDEX idx_status (status),
  INDEX idx_qualification (qualification_status),
  INDEX idx_completed_at (completed_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


-- 2️⃣ QUALIFICATION CUTOFFS TABLE
-- Admin-configurable thresholds for automatic qualification
CREATE TABLE IF NOT EXISTS qualification_cutoffs (
  id CHAR(36) PRIMARY KEY DEFAULT (UUID()),
  level_id INT NOT NULL UNIQUE,                    -- Level these cutoffs apply to
  
  -- Cutoff Criteria (team must meet ALL to qualify)
  min_score INT DEFAULT 0,                         -- Minimum total score required
  min_accuracy DECIMAL(5,2) DEFAULT 0.00,          -- Minimum accuracy % (0-100)
  max_time_seconds INT DEFAULT 7200,               -- Maximum time allowed (default 2 hours)
  max_hints_allowed INT DEFAULT 10,                -- Maximum hints allowed
  min_questions_correct INT DEFAULT 5,             -- Minimum correct answers
  
  -- Settings
  is_active BOOLEAN DEFAULT true,                  -- Whether auto-qualification is active
  auto_qualify BOOLEAN DEFAULT true,               -- If false, admin must manually qualify
  
  -- Metadata
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  updated_by CHAR(36) NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


-- 3️⃣ TEAM QUALIFICATION MESSAGES TABLE
-- Stores qualification/disqualification messages for teams
CREATE TABLE IF NOT EXISTS team_qualification_messages (
  id CHAR(36) PRIMARY KEY DEFAULT (UUID()),
  team_id CHAR(36) NOT NULL,
  level_id INT NOT NULL,
  
  -- Message Content
  message_type ENUM('QUALIFICATION', 'DISQUALIFICATION', 'INFO', 'WARNING') NOT NULL,
  title VARCHAR(255) NOT NULL,
  message TEXT NOT NULL,
  
  -- Status
  is_read BOOLEAN DEFAULT false,
  is_dismissed BOOLEAN DEFAULT false,
  
  -- Timestamps
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  read_at TIMESTAMP NULL,
  dismissed_at TIMESTAMP NULL,
  
  FOREIGN KEY (team_id) REFERENCES teams(id) ON DELETE CASCADE,
  INDEX idx_team (team_id),
  INDEX idx_level (level_id),
  INDEX idx_unread (team_id, is_read, is_dismissed)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


-- 4️⃣ QUALIFICATION AUDIT LOG TABLE
-- Tracks all qualification-related events for audit trail
CREATE TABLE IF NOT EXISTS qualification_audit_log (
  id CHAR(36) PRIMARY KEY DEFAULT (UUID()),
  team_id CHAR(36) NOT NULL,
  level_id INT NOT NULL,
  
  -- Event Details
  action ENUM(
    'LEVEL_STARTED',
    'LEVEL_COMPLETED',
    'AUTO_QUALIFIED',
    'AUTO_DISQUALIFIED',
    'ADMIN_QUALIFIED',
    'ADMIN_DISQUALIFIED',
    'CUTOFF_UPDATED',
    'STATUS_RESET'
  ) NOT NULL,
  
  -- Before/After State
  previous_status VARCHAR(50) NULL,
  new_status VARCHAR(50) NULL,
  
  -- Performance snapshot at time of action
  score_snapshot INT NULL,
  accuracy_snapshot DECIMAL(5,2) NULL,
  time_snapshot INT NULL,
  hints_snapshot INT NULL,
  
  -- Actor
  performed_by CHAR(36) NULL,                      -- NULL = system, otherwise admin user ID
  reason TEXT NULL,
  
  -- Metadata
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  
  FOREIGN KEY (team_id) REFERENCES teams(id) ON DELETE CASCADE,
  INDEX idx_team (team_id),
  INDEX idx_level (level_id),
  INDEX idx_action (action),
  INDEX idx_created_at (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


-- =====================================================
-- INSERT DEFAULT CUTOFF VALUES
-- =====================================================

-- Default cutoffs for Level 1 (required to qualify for Level 2)
INSERT INTO qualification_cutoffs (id, level_id, min_score, min_accuracy, max_time_seconds, max_hints_allowed, min_questions_correct, is_active, auto_qualify)
VALUES (UUID(), 1, 500, 60.00, 3600, 5, 6, true, true)
ON DUPLICATE KEY UPDATE updated_at = CURRENT_TIMESTAMP;

-- Default cutoffs for Level 2 (for final rankings)
INSERT INTO qualification_cutoffs (id, level_id, min_score, min_accuracy, max_time_seconds, max_hints_allowed, min_questions_correct, is_active, auto_qualify)
VALUES (UUID(), 2, 800, 70.00, 5400, 3, 8, true, true)
ON DUPLICATE KEY UPDATE updated_at = CURRENT_TIMESTAMP;


-- =====================================================
-- HELPER VIEW: Team Qualification Summary
-- =====================================================
CREATE OR REPLACE VIEW v_team_qualification_summary AS
SELECT 
  t.id AS team_id,
  t.team_name,
  t.status AS team_status,
  
  -- Level 1 Status
  COALESCE(tls1.status, 'NOT_STARTED') AS level_1_status,
  COALESCE(tls1.qualification_status, 'PENDING') AS level_1_qualification,
  tls1.score AS level_1_score,
  tls1.accuracy AS level_1_accuracy,
  tls1.time_taken_seconds AS level_1_time,
  tls1.hints_used AS level_1_hints,
  tls1.completed_at AS level_1_completed_at,
  
  -- Level 2 Status
  COALESCE(tls2.status, 'NOT_STARTED') AS level_2_status,
  COALESCE(tls2.qualification_status, 'PENDING') AS level_2_qualification,
  tls2.score AS level_2_score,
  tls2.accuracy AS level_2_accuracy,
  tls2.time_taken_seconds AS level_2_time,
  tls2.hints_used AS level_2_hints,
  tls2.completed_at AS level_2_completed_at,
  
  -- Can access Level 2?
  CASE 
    WHEN tls1.qualification_status = 'QUALIFIED' THEN true
    ELSE false
  END AS can_access_level_2,
  
  -- Total Stats
  COALESCE(tls1.score, 0) + COALESCE(tls2.score, 0) AS total_score,
  COALESCE(tls1.time_taken_seconds, 0) + COALESCE(tls2.time_taken_seconds, 0) AS total_time
  
FROM teams t
LEFT JOIN team_level_status tls1 ON t.id = tls1.team_id AND tls1.level_id = 1
LEFT JOIN team_level_status tls2 ON t.id = tls2.team_id AND tls2.level_id = 2;
