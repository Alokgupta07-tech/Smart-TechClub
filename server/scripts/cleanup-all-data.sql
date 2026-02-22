-- ============================================================
-- CLEANUP ALL TEAM AND USER DATA
-- ============================================================
-- WARNING: This script will permanently delete ALL team and user data!
-- Use with extreme caution. This action cannot be undone.
-- Run this script to reset the game for a new event.
-- ============================================================

-- Disable foreign key checks temporarily (MySQL)
-- SET FOREIGN_KEY_CHECKS = 0;

-- For PostgreSQL/Supabase, we rely on CASCADE delete

BEGIN;

-- ============================================================
-- 1. DELETE ALL USER-RELATED DATA
-- ============================================================

-- Delete team question progress
DELETE FROM team_question_progress;

-- Delete team level status (qualification data)
DELETE FROM team_level_status;

-- Delete evaluation audit logs
DELETE FROM evaluation_audit_log;

-- Delete hint usage records
DELETE FROM hint_usage;

-- Delete team progress records
DELETE FROM team_progress;

-- Delete all submissions
DELETE FROM submissions;

-- Delete activity logs
DELETE FROM activity_logs;

-- Delete refresh tokens
DELETE FROM refresh_tokens;

-- Delete email OTPs
DELETE FROM email_otps;

-- Delete team members
DELETE FROM team_members;

-- Delete all teams
DELETE FROM teams;

-- Delete all users (except admins - optional, comment out if you want to keep admins)
DELETE FROM users WHERE role = 'team';

-- If you want to delete ALL users including admins, use this instead:
-- DELETE FROM users;

-- ============================================================
-- 2. RESET EVALUATION STATE (Optional)
-- ============================================================
-- Uncomment these if you want to reset the evaluation state as well

-- DELETE FROM level_evaluation_state;

-- ============================================================
-- 3. RESET GAME STATE (Optional)
-- ============================================================
-- Uncomment if you want to reset the game to initial state
-- This will close all levels and stop the game

-- UPDATE game_state SET 
--   game_active = false,
--   level1_open = false,
--   level2_open = false,
--   game_started_at = NULL,
--   game_ended_at = NULL;

COMMIT;

-- Re-enable foreign key checks (MySQL)
-- SET FOREIGN_KEY_CHECKS = 1;

-- ============================================================
-- VERIFICATION QUERIES
-- ============================================================
-- Run these after cleanup to verify:

-- SELECT COUNT(*) as user_count FROM users;
-- SELECT COUNT(*) as team_count FROM teams;
-- SELECT COUNT(*) as submission_count FROM submissions;
-- SELECT COUNT(*) as progress_count FROM team_progress;
-- SELECT COUNT(*) as hint_usage_count FROM hint_usage;
