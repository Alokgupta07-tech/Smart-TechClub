-- Migration: Fix Level 1 evaluation state to RESULTS_PUBLISHED
-- This prevents teams from being blocked when trying to access Gameplay
-- Date: 2026-02-22
-- Purpose: Level 1 should always be accessible, so its results should be marked as published

-- Update Level 1 evaluation state to RESULTS_PUBLISHED
UPDATE level_evaluation_state
SET 
  evaluation_state = 'RESULTS_PUBLISHED',
  results_published_at = COALESCE(results_published_at, NOW()),
  updated_at = NOW()
WHERE level_id = 1
  AND evaluation_state != 'RESULTS_PUBLISHED';

-- Ensure Level 1 entry exists (in case it was never created)
INSERT INTO level_evaluation_state (level_id, evaluation_state, results_published_at)
VALUES (1, 'RESULTS_PUBLISHED', NOW())
ON CONFLICT (level_id) DO UPDATE
SET 
  evaluation_state = 'RESULTS_PUBLISHED',
  results_published_at = COALESCE(level_evaluation_state.results_published_at, NOW()),
  updated_at = NOW()
WHERE level_evaluation_state.evaluation_state != 'RESULTS_PUBLISHED';

-- Log the migration
DO $$
BEGIN
  RAISE NOTICE 'Migration completed: Level 1 evaluation state set to RESULTS_PUBLISHED';
END $$;
