-- Migration: Update Level 2 puzzles to 8 minutes per question
-- Date: 2026-02-15
-- Total time for Level 2: 40 minutes (5 questions × 8 minutes)

-- Update Level 2 puzzles to 8 minute time limit
UPDATE puzzles SET time_limit_minutes = 8 WHERE level = 2;

-- Update Level 1 puzzles to 4 minute time limit (if not already updated)
UPDATE puzzles SET time_limit_minutes = 4 WHERE level = 1;
