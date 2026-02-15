-- Migration: Update all puzzle time limits to 4 minutes
-- Date: 2026-02-15

-- Update all existing puzzles to 4 minute time limit
UPDATE puzzles SET time_limit_minutes = 4 WHERE time_limit_minutes != 4;

-- Update game settings for question time limit (4 minutes = 240 seconds)
UPDATE game_settings SET question_time_limit_seconds = 240 WHERE question_time_limit_seconds != 240;
