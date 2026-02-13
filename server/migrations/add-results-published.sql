-- Migration: Add results_published column to game_state table
-- This column controls when the celebration modal is shown to winners

-- Add results_published column if it doesn't exist
ALTER TABLE game_state 
ADD COLUMN IF NOT EXISTS results_published BOOLEAN DEFAULT FALSE;

-- Add comment describing the column
COMMENT ON COLUMN game_state.results_published IS 'When true, top 3 teams will see celebration modal';
