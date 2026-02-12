-- =====================================================
-- LOCKDOWN HQ - SUPABASE DATABASE SCHEMA
-- Full PostgreSQL Schema for Supabase
-- =====================================================
-- Run this in Supabase SQL Editor (https://supabase.com/dashboard/project/YOUR_PROJECT/sql)

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- =====================================================
-- DROP ALL EXISTING TABLES (Clean Setup)
-- =====================================================
DROP TABLE IF EXISTS inventory CASCADE;
DROP TABLE IF EXISTS broadcasts CASCADE;
DROP TABLE IF EXISTS game_state CASCADE;
DROP TABLE IF EXISTS team_question_progress CASCADE;
DROP TABLE IF EXISTS evaluation_audit_log CASCADE;
DROP TABLE IF EXISTS qualification_cutoffs CASCADE;
DROP TABLE IF EXISTS team_level_status CASCADE;
DROP TABLE IF EXISTS level_evaluation_state CASCADE;
DROP TABLE IF EXISTS email_otps CASCADE;
DROP TABLE IF EXISTS refresh_tokens CASCADE;
DROP TABLE IF EXISTS audit_logs CASCADE;
DROP TABLE IF EXISTS activity_logs CASCADE;
DROP TABLE IF EXISTS hint_usage CASCADE;
DROP TABLE IF EXISTS team_progress CASCADE;
DROP TABLE IF EXISTS submissions CASCADE;
DROP TABLE IF EXISTS hints CASCADE;
DROP TABLE IF EXISTS puzzles CASCADE;
DROP TABLE IF EXISTS team_members CASCADE;
DROP TABLE IF EXISTS teams CASCADE;
DROP TABLE IF EXISTS users CASCADE;

-- Drop existing triggers and function
DROP TRIGGER IF EXISTS update_users_updated_at ON users;
DROP TRIGGER IF EXISTS update_teams_updated_at ON teams;
DROP TRIGGER IF EXISTS update_puzzles_updated_at ON puzzles;
DROP TRIGGER IF EXISTS update_team_level_status_updated_at ON team_level_status;
DROP TRIGGER IF EXISTS update_level_evaluation_state_updated_at ON level_evaluation_state;
DROP TRIGGER IF EXISTS update_team_question_progress_updated_at ON team_question_progress;
DROP FUNCTION IF EXISTS update_updated_at_column();

-- =====================================================
-- 1. USERS TABLE
-- =====================================================
CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name VARCHAR(100) NOT NULL,
  email VARCHAR(150) UNIQUE NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  role VARCHAR(20) DEFAULT 'team' CHECK (role IN ('admin', 'team')),
  is_verified BOOLEAN DEFAULT FALSE,
  two_fa_enabled BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);

-- =====================================================
-- 2. TEAMS TABLE
-- =====================================================
CREATE TABLE IF NOT EXISTS teams (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID UNIQUE NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  team_name VARCHAR(100) NOT NULL UNIQUE,
  level INT DEFAULT 1,
  status VARCHAR(20) DEFAULT 'waiting' CHECK (status IN ('waiting', 'active', 'completed', 'disqualified')),
  progress INT DEFAULT 0 CHECK (progress >= 0 AND progress <= 100),
  hints_used INT DEFAULT 0,
  start_time TIMESTAMPTZ,
  end_time TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_teams_status ON teams(status);
CREATE INDEX IF NOT EXISTS idx_teams_level ON teams(level);
CREATE INDEX IF NOT EXISTS idx_teams_user_id ON teams(user_id);

-- =====================================================
-- 3. TEAM MEMBERS TABLE
-- =====================================================
CREATE TABLE IF NOT EXISTS team_members (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  team_id UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  member_name VARCHAR(100) NOT NULL,
  member_email VARCHAR(150),
  member_role VARCHAR(50),
  is_leader BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_team_members_team ON team_members(team_id);

-- =====================================================
-- 4. PUZZLES TABLE
-- =====================================================
CREATE TABLE IF NOT EXISTS puzzles (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  level INT NOT NULL,
  puzzle_number INT NOT NULL,
  title VARCHAR(255) NOT NULL,
  description TEXT,
  puzzle_type VARCHAR(20) DEFAULT 'text' CHECK (puzzle_type IN ('text', 'code', 'image', 'qr', 'html', 'cipher', 'mixed')),
  puzzle_content TEXT,
  puzzle_file_url VARCHAR(500),
  correct_answer TEXT NOT NULL,
  points INT DEFAULT 100,
  time_limit_minutes INT DEFAULT 30,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(level, puzzle_number)
);

CREATE INDEX IF NOT EXISTS idx_puzzles_level ON puzzles(level);
CREATE INDEX IF NOT EXISTS idx_puzzles_active ON puzzles(is_active);

-- =====================================================
-- 5. HINTS TABLE
-- =====================================================
CREATE TABLE IF NOT EXISTS hints (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  puzzle_id UUID NOT NULL REFERENCES puzzles(id) ON DELETE CASCADE,
  hint_number INT NOT NULL,
  hint_text TEXT NOT NULL,
  time_penalty_seconds INT DEFAULT 300,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(puzzle_id, hint_number)
);

CREATE INDEX IF NOT EXISTS idx_hints_puzzle ON hints(puzzle_id);

-- =====================================================
-- 6. SUBMISSIONS TABLE
-- =====================================================
CREATE TABLE IF NOT EXISTS submissions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  team_id UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  puzzle_id UUID NOT NULL REFERENCES puzzles(id) ON DELETE CASCADE,
  submitted_answer TEXT NOT NULL,
  is_correct BOOLEAN NOT NULL,
  submitted_at TIMESTAMPTZ DEFAULT NOW(),
  time_taken_seconds INT,
  evaluation_status VARCHAR(20) DEFAULT 'PENDING' CHECK (evaluation_status IN ('PENDING', 'EVALUATED')),
  score_awarded INT DEFAULT 0,
  evaluated_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_submissions_team ON submissions(team_id);
CREATE INDEX IF NOT EXISTS idx_submissions_puzzle ON submissions(puzzle_id);
CREATE INDEX IF NOT EXISTS idx_submissions_correct ON submissions(is_correct);
CREATE INDEX IF NOT EXISTS idx_submissions_eval_status ON submissions(evaluation_status);

-- =====================================================
-- 7. TEAM PROGRESS TABLE
-- =====================================================
CREATE TABLE IF NOT EXISTS team_progress (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  team_id UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  puzzle_id UUID NOT NULL REFERENCES puzzles(id) ON DELETE CASCADE,
  current_level INT NOT NULL DEFAULT 1,
  current_puzzle INT NOT NULL DEFAULT 1,
  is_completed BOOLEAN DEFAULT FALSE,
  started_at TIMESTAMPTZ DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  hints_used INT DEFAULT 0,
  attempts INT DEFAULT 0,
  UNIQUE(team_id, puzzle_id)
);

CREATE INDEX IF NOT EXISTS idx_team_progress_team ON team_progress(team_id);
CREATE INDEX IF NOT EXISTS idx_team_progress_level ON team_progress(current_level);

-- =====================================================
-- 8. HINT USAGE TABLE
-- =====================================================
CREATE TABLE IF NOT EXISTS hint_usage (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  team_id UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  hint_id UUID NOT NULL REFERENCES hints(id) ON DELETE CASCADE,
  puzzle_id UUID NOT NULL REFERENCES puzzles(id) ON DELETE CASCADE,
  used_at TIMESTAMPTZ DEFAULT NOW(),
  time_penalty_applied INT DEFAULT 0,
  UNIQUE(team_id, hint_id)
);

CREATE INDEX IF NOT EXISTS idx_hint_usage_team ON hint_usage(team_id);
CREATE INDEX IF NOT EXISTS idx_hint_usage_puzzle ON hint_usage(puzzle_id);

-- =====================================================
-- 9. ACTIVITY LOGS TABLE
-- =====================================================
CREATE TABLE IF NOT EXISTS activity_logs (
  id SERIAL PRIMARY KEY,
  team_id UUID REFERENCES teams(id) ON DELETE CASCADE,
  type VARCHAR(50) NOT NULL CHECK (type IN ('tab_switch', 'violation', 'level_complete', 'hint_used', 'system', 'login', 'logout')),
  message VARCHAR(255) NOT NULL,
  severity VARCHAR(20) DEFAULT 'info' CHECK (severity IN ('info', 'warning', 'critical')),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_activity_logs_team ON activity_logs(team_id);
CREATE INDEX IF NOT EXISTS idx_activity_logs_type ON activity_logs(type);
CREATE INDEX IF NOT EXISTS idx_activity_logs_created ON activity_logs(created_at DESC);

-- =====================================================
-- 10. AUDIT LOGS TABLE
-- =====================================================
CREATE TABLE IF NOT EXISTS audit_logs (
  id SERIAL PRIMARY KEY,
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  action VARCHAR(100) NOT NULL,
  ip_address VARCHAR(45),
  user_agent VARCHAR(255),
  details TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_audit_logs_user ON audit_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_action ON audit_logs(action);

-- =====================================================
-- 11. REFRESH TOKENS TABLE
-- =====================================================
CREATE TABLE IF NOT EXISTS refresh_tokens (
  id SERIAL PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token VARCHAR(500) NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_refresh_tokens_user ON refresh_tokens(user_id);
CREATE INDEX IF NOT EXISTS idx_refresh_tokens_expires ON refresh_tokens(expires_at);

-- =====================================================
-- 12. EMAIL OTPS TABLE
-- =====================================================
CREATE TABLE IF NOT EXISTS email_otps (
  id SERIAL PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  otp VARCHAR(6) NOT NULL,
  purpose VARCHAR(20) NOT NULL CHECK (purpose IN ('verify', 'reset', '2fa')),
  expires_at TIMESTAMPTZ NOT NULL,
  used BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_email_otps_user ON email_otps(user_id);
CREATE INDEX IF NOT EXISTS idx_email_otps_otp ON email_otps(otp);

-- =====================================================
-- 13. LEVEL EVALUATION STATE TABLE
-- =====================================================
CREATE TABLE IF NOT EXISTS level_evaluation_state (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  level_id INT NOT NULL UNIQUE,
  evaluation_state VARCHAR(30) DEFAULT 'IN_PROGRESS' CHECK (evaluation_state IN ('IN_PROGRESS', 'SUBMISSIONS_CLOSED', 'EVALUATING', 'RESULTS_PUBLISHED')),
  submissions_closed_at TIMESTAMPTZ,
  evaluation_started_at TIMESTAMPTZ,
  evaluated_at TIMESTAMPTZ,
  results_published_at TIMESTAMPTZ,
  closed_by UUID,
  evaluated_by UUID,
  published_by UUID,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_level_eval_state ON level_evaluation_state(evaluation_state);

-- =====================================================
-- 14. TEAM LEVEL STATUS TABLE
-- =====================================================
CREATE TABLE IF NOT EXISTS team_level_status (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  team_id UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  level_id INT NOT NULL,
  status VARCHAR(20) DEFAULT 'NOT_STARTED' CHECK (status IN ('NOT_STARTED', 'IN_PROGRESS', 'COMPLETED')),
  qualification_status VARCHAR(20) DEFAULT 'PENDING' CHECK (qualification_status IN ('PENDING', 'QUALIFIED', 'DISQUALIFIED')),
  score INT DEFAULT 0,
  questions_answered INT DEFAULT 0,
  questions_correct INT DEFAULT 0,
  accuracy DECIMAL(5,2) DEFAULT 0.00,
  time_taken_seconds INT DEFAULT 0,
  hints_used INT DEFAULT 0,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  qualification_decided_at TIMESTAMPTZ,
  was_manually_overridden BOOLEAN DEFAULT FALSE,
  override_by UUID,
  override_reason VARCHAR(255),
  override_at TIMESTAMPTZ,
  results_visible BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(team_id, level_id)
);

CREATE INDEX IF NOT EXISTS idx_team_level_team ON team_level_status(team_id);
CREATE INDEX IF NOT EXISTS idx_team_level_status ON team_level_status(status);
CREATE INDEX IF NOT EXISTS idx_team_level_qualification ON team_level_status(qualification_status);

-- =====================================================
-- 15. QUALIFICATION CUTOFFS TABLE
-- =====================================================
CREATE TABLE IF NOT EXISTS qualification_cutoffs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  level_id INT NOT NULL UNIQUE,
  min_score INT DEFAULT 0,
  min_accuracy DECIMAL(5,2) DEFAULT 0.00,
  max_time_seconds INT DEFAULT 7200,
  max_hints_allowed INT DEFAULT 10,
  min_questions_correct INT DEFAULT 5,
  is_active BOOLEAN DEFAULT TRUE,
  auto_qualify BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  updated_by UUID
);

-- =====================================================
-- 16. EVALUATION AUDIT LOG TABLE
-- =====================================================
CREATE TABLE IF NOT EXISTS evaluation_audit_log (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  level_id INT NOT NULL,
  action VARCHAR(50) NOT NULL CHECK (action IN ('SUBMISSIONS_CLOSED', 'SUBMISSIONS_REOPENED', 'EVALUATION_STARTED', 'EVALUATION_COMPLETED', 'RESULTS_PUBLISHED', 'RESULTS_UNPUBLISHED')),
  admin_id UUID NOT NULL,
  admin_name VARCHAR(100),
  teams_evaluated INT DEFAULT 0,
  submissions_evaluated INT DEFAULT 0,
  details JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_eval_audit_level ON evaluation_audit_log(level_id);
CREATE INDEX IF NOT EXISTS idx_eval_audit_action ON evaluation_audit_log(action);

-- =====================================================
-- 17. TEAM QUESTION PROGRESS TABLE
-- =====================================================
CREATE TABLE IF NOT EXISTS team_question_progress (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  team_id UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  puzzle_id UUID NOT NULL REFERENCES puzzles(id) ON DELETE CASCADE,
  status VARCHAR(20) DEFAULT 'NOT_STARTED' CHECK (status IN ('NOT_STARTED', 'IN_PROGRESS', 'COMPLETED', 'SKIPPED')),
  attempts INT DEFAULT 0,
  correct BOOLEAN DEFAULT FALSE,
  time_spent_seconds INT DEFAULT 0,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(team_id, puzzle_id)
);

CREATE INDEX IF NOT EXISTS idx_tqp_team ON team_question_progress(team_id);
CREATE INDEX IF NOT EXISTS idx_tqp_puzzle ON team_question_progress(puzzle_id);
CREATE INDEX IF NOT EXISTS idx_tqp_status ON team_question_progress(status);

-- =====================================================
-- 18. GAME STATE TABLE
-- =====================================================
CREATE TABLE IF NOT EXISTS game_state (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  game_active BOOLEAN DEFAULT FALSE,
  current_level INT DEFAULT 1,
  level1_open BOOLEAN DEFAULT TRUE,
  level2_open BOOLEAN DEFAULT FALSE,
  game_started_at TIMESTAMPTZ,
  game_ended_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  updated_by UUID
);

-- Insert default game state
INSERT INTO game_state (game_active, current_level, level1_open, level2_open) 
VALUES (false, 1, true, false)
ON CONFLICT DO NOTHING;

-- =====================================================
-- 19. BROADCASTS TABLE (Admin Messages)
-- =====================================================
CREATE TABLE IF NOT EXISTS broadcasts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  message TEXT NOT NULL,
  message_type VARCHAR(20) DEFAULT 'info' CHECK (message_type IN ('info', 'warning', 'alert', 'success')),
  target_level INT,
  created_by UUID,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  expires_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_broadcasts_created ON broadcasts(created_at DESC);

-- =====================================================
-- 20. INVENTORY TABLE
-- =====================================================
CREATE TABLE IF NOT EXISTS inventory (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  team_id UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  item_type VARCHAR(20) DEFAULT 'clue' CHECK (item_type IN ('clue', 'key', 'code', 'data', 'intelligence')),
  item_name VARCHAR(255) NOT NULL,
  item_value TEXT,
  collected_from_puzzle UUID REFERENCES puzzles(id),
  collected_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_inventory_team ON inventory(team_id);

-- =====================================================
-- TRIGGERS FOR AUTO-UPDATING updated_at
-- =====================================================

-- Function to auto-update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ language 'plpgsql';

-- Apply trigger to tables with updated_at
CREATE TRIGGER update_users_updated_at
  BEFORE UPDATE ON users
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_teams_updated_at
  BEFORE UPDATE ON teams
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_puzzles_updated_at
  BEFORE UPDATE ON puzzles
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_team_level_status_updated_at
  BEFORE UPDATE ON team_level_status
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_level_evaluation_state_updated_at
  BEFORE UPDATE ON level_evaluation_state
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_team_question_progress_updated_at
  BEFORE UPDATE ON team_question_progress
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- =====================================================
-- ROW LEVEL SECURITY (RLS) POLICIES
-- =====================================================

-- Enable RLS on all tables
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE teams ENABLE ROW LEVEL SECURITY;
ALTER TABLE team_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE puzzles ENABLE ROW LEVEL SECURITY;
ALTER TABLE hints ENABLE ROW LEVEL SECURITY;
ALTER TABLE submissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE team_progress ENABLE ROW LEVEL SECURITY;
ALTER TABLE hint_usage ENABLE ROW LEVEL SECURITY;
ALTER TABLE activity_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE team_level_status ENABLE ROW LEVEL SECURITY;
ALTER TABLE team_question_progress ENABLE ROW LEVEL SECURITY;

-- Policy: Users can read their own data
CREATE POLICY "Users can view own data" ON users
  FOR SELECT USING (auth.uid()::text = id::text);

-- Policy: Teams can read their own team data
CREATE POLICY "Teams can view own team" ON teams
  FOR SELECT USING (user_id::text = auth.uid()::text);

-- Policy: Allow service role full access (for backend)
CREATE POLICY "Service role has full access to users" ON users
  FOR ALL USING (auth.role() = 'service_role');

CREATE POLICY "Service role has full access to teams" ON teams
  FOR ALL USING (auth.role() = 'service_role');

CREATE POLICY "Service role has full access to puzzles" ON puzzles
  FOR ALL USING (auth.role() = 'service_role');

CREATE POLICY "Service role has full access to submissions" ON submissions
  FOR ALL USING (auth.role() = 'service_role');

-- Policy: Everyone can read active puzzles (answer hidden)
CREATE POLICY "Anyone can read active puzzles" ON puzzles
  FOR SELECT USING (is_active = true);

-- =====================================================
-- SEED DATA: DEFAULT ADMIN USER
-- =====================================================
-- Password: tech@2026 (hash generated with bcrypt)
-- You must manually update this hash or use the backend to create admin

INSERT INTO users (name, email, password_hash, role, is_verified) 
VALUES (
  'Admin',
  'agupta88094@gmail.com',
  '$2b$10$LKxQQjl3Aef4Ik8kLQxJZ.V6YR8j7kLM7j8kLQxJZ.V6YR8j7kLM', -- Placeholder - update via backend
  'admin',
  true
) ON CONFLICT (email) DO NOTHING;

-- Initialize Level 1 and Level 2 evaluation states
INSERT INTO level_evaluation_state (level_id, evaluation_state) VALUES (1, 'IN_PROGRESS') ON CONFLICT (level_id) DO NOTHING;
INSERT INTO level_evaluation_state (level_id, evaluation_state) VALUES (2, 'IN_PROGRESS') ON CONFLICT (level_id) DO NOTHING;

-- Initialize default qualification cutoffs
INSERT INTO qualification_cutoffs (level_id, min_score, min_accuracy, max_time_seconds, min_questions_correct)
VALUES (1, 0, 80.00, 7200, 8) ON CONFLICT (level_id) DO NOTHING;

INSERT INTO qualification_cutoffs (level_id, min_score, min_accuracy, max_time_seconds, min_questions_correct)
VALUES (2, 0, 70.00, 5400, 7) ON CONFLICT (level_id) DO NOTHING;

-- =====================================================
-- DONE! Schema is ready for use with Supabase.
-- =====================================================
