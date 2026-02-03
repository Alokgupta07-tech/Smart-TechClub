// server/services/hintService.js
const db = require('../config/db');
const { notifyHintPenalty } = require('./notificationService');

/**
 * Progressive Hint Service
 * Handles sequential hint unlocking with escalating penalties
 */

/**
 * Get available hints for a puzzle based on time elapsed and previous hints used
 */
async function getAvailableHints(teamId, puzzleId) {
  // Get all hints for the puzzle
  const [hints] = await db.query(`
    SELECT h.*, 
      CASE WHEN hu.id IS NOT NULL THEN true ELSE false END as is_used
    FROM hints h
    LEFT JOIN hint_usage hu ON h.id = hu.hint_id AND hu.team_id = ?
    WHERE h.puzzle_id = ? AND h.is_active = true
    ORDER BY h.hint_number ASC
  `, [teamId, puzzleId]);

  // Get team's progress on this puzzle
  const [[progress]] = await db.query(`
    SELECT puzzle_started_at, last_hint_number
    FROM team_progress
    WHERE team_id = ? AND puzzle_id = ?
  `, [teamId, puzzleId]);

  if (!progress || !progress.puzzle_started_at) {
    return { hints: [], nextHintUnlockIn: null };
  }

  const elapsedSeconds = Math.floor((Date.now() - new Date(progress.puzzle_started_at).getTime()) / 1000);
  const lastHintNumber = progress.last_hint_number || 0;

  // Determine which hints are available
  const availableHints = hints.map((hint, index) => {
    const isUnlocked = hint.is_used || (
      index === lastHintNumber && // Next sequential hint
      elapsedSeconds >= hint.unlock_after_seconds
    );

    return {
      ...hint,
      isUnlocked,
      canUnlock: !hint.is_used && index === lastHintNumber && elapsedSeconds >= hint.unlock_after_seconds,
      unlockAfterSeconds: hint.unlock_after_seconds,
      penaltySeconds: Math.round(hint.time_penalty_seconds * hint.penalty_multiplier)
    };
  });

  // Calculate next hint unlock time
  let nextHintUnlockIn = null;
  const nextHint = hints[lastHintNumber];
  if (nextHint && !availableHints[lastHintNumber]?.is_used) {
    const remainingSeconds = nextHint.unlock_after_seconds - elapsedSeconds;
    if (remainingSeconds > 0) {
      nextHintUnlockIn = remainingSeconds;
    }
  }

  return {
    hints: availableHints,
    nextHintUnlockIn,
    elapsedSeconds,
    lastHintNumber
  };
}

/**
 * Use a hint (progressive system)
 */
async function useHint(teamId, puzzleId, hintId) {
  // Get the hint
  const [[hint]] = await db.query(`
    SELECT * FROM hints WHERE id = ? AND puzzle_id = ?
  `, [hintId, puzzleId]);

  if (!hint) {
    throw new Error('Hint not found');
  }

  // Check if hint was already used
  const [[existing]] = await db.query(`
    SELECT id FROM hint_usage WHERE team_id = ? AND hint_id = ?
  `, [teamId, hintId]);

  if (existing) {
    throw new Error('Hint already used');
  }

  // Verify this is the next sequential hint
  const [[progress]] = await db.query(`
    SELECT last_hint_number FROM team_progress WHERE team_id = ? AND puzzle_id = ?
  `, [teamId, puzzleId]);

  const lastHintNumber = progress?.last_hint_number || 0;
  if (hint.hint_number !== lastHintNumber + 1) {
    throw new Error('Hints must be unlocked in order');
  }

  // Calculate penalty with multiplier
  const penaltySeconds = Math.round(hint.time_penalty_seconds * hint.penalty_multiplier);

  // Record hint usage
  await db.query(`
    INSERT INTO hint_usage (id, team_id, hint_id, puzzle_id, time_penalty_applied)
    VALUES (UUID(), ?, ?, ?, ?)
  `, [teamId, hintId, puzzleId, penaltySeconds]);

  // Update team's hints used count
  await db.query(`
    UPDATE teams SET hints_used = hints_used + 1 WHERE id = ?
  `, [teamId]);

  // Update progress with last hint number
  await db.query(`
    UPDATE team_progress 
    SET last_hint_number = ?, hints_used = hints_used + 1
    WHERE team_id = ? AND puzzle_id = ?
  `, [hint.hint_number, teamId, puzzleId]);

  // Send notification
  await notifyHintPenalty(teamId, hint.hint_number, penaltySeconds);

  // Log activity
  await db.query(`
    INSERT INTO activity_logs (id, team_id, action_type, description, puzzle_id, metadata)
    VALUES (UUID(), ?, 'hint_use', ?, ?, ?)
  `, [
    teamId, 
    `Used hint ${hint.hint_number} (penalty: ${penaltySeconds}s)`,
    puzzleId,
    JSON.stringify({ hintNumber: hint.hint_number, penalty: penaltySeconds })
  ]);

  return {
    hintText: hint.hint_text,
    hintNumber: hint.hint_number,
    penaltySeconds
  };
}

/**
 * Get total hint penalty for a team
 */
async function getTotalHintPenalty(teamId) {
  const [[result]] = await db.query(`
    SELECT COALESCE(SUM(time_penalty_applied), 0) as total_penalty
    FROM hint_usage
    WHERE team_id = ?
  `, [teamId]);
  
  return result.total_penalty;
}

module.exports = {
  getAvailableHints,
  useHint,
  getTotalHintPenalty
};
