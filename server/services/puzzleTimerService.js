// server/services/puzzleTimerService.js
const db = require('../config/db');

/**
 * Puzzle Timer Service
 * Handles per-puzzle time limits and expiration
 */

/**
 * Start puzzle timer for a team
 */
async function startPuzzleTimer(teamId, puzzleId) {
  // Check if already started
  const [[existing]] = await db.query(`
    SELECT puzzle_started_at FROM team_progress
    WHERE team_id = ? AND puzzle_id = ?
  `, [teamId, puzzleId]);

  if (existing?.puzzle_started_at) {
    return { alreadyStarted: true, startedAt: existing.puzzle_started_at };
  }

  // Start the timer
  await db.query(`
    UPDATE team_progress
    SET puzzle_started_at = NOW()
    WHERE team_id = ? AND puzzle_id = ?
  `, [teamId, puzzleId]);

  // Log activity
  await db.query(`
    INSERT INTO activity_logs (id, team_id, action_type, description, puzzle_id)
    VALUES (UUID(), ?, 'puzzle_start', 'Started puzzle timer', ?)
  `, [teamId, puzzleId]);

  return { alreadyStarted: false, startedAt: new Date() };
}

/**
 * Check if puzzle timer has expired
 */
async function checkPuzzleExpired(teamId, puzzleId) {
  const [[result]] = await db.query(`
    SELECT 
      tp.puzzle_started_at,
      tp.time_expired,
      tp.is_completed,
      p.time_limit_seconds
    FROM team_progress tp
    JOIN puzzles p ON tp.puzzle_id = p.id
    WHERE tp.team_id = ? AND tp.puzzle_id = ?
  `, [teamId, puzzleId]);

  if (!result) {
    return { expired: false, exists: false };
  }

  if (result.is_completed) {
    return { expired: false, completed: true };
  }

  if (result.time_expired) {
    return { expired: true, markedExpired: true };
  }

  if (!result.puzzle_started_at || !result.time_limit_seconds) {
    return { expired: false, noLimit: true };
  }

  const startTime = new Date(result.puzzle_started_at).getTime();
  const elapsedSeconds = Math.floor((Date.now() - startTime) / 1000);
  const remainingSeconds = result.time_limit_seconds - elapsedSeconds;

  if (remainingSeconds <= 0) {
    // Mark as expired
    await db.query(`
      UPDATE team_progress SET time_expired = true
      WHERE team_id = ? AND puzzle_id = ?
    `, [teamId, puzzleId]);

    return { expired: true, elapsedSeconds, timeLimit: result.time_limit_seconds };
  }

  return {
    expired: false,
    elapsedSeconds,
    remainingSeconds,
    timeLimit: result.time_limit_seconds
  };
}

/**
 * Get puzzle timer status
 */
async function getPuzzleTimerStatus(teamId, puzzleId) {
  const [[result]] = await db.query(`
    SELECT 
      tp.puzzle_started_at,
      tp.time_expired,
      tp.is_completed,
      p.time_limit_seconds,
      p.title as puzzle_title
    FROM team_progress tp
    JOIN puzzles p ON tp.puzzle_id = p.id
    WHERE tp.team_id = ? AND tp.puzzle_id = ?
  `, [teamId, puzzleId]);

  if (!result) {
    return null;
  }

  let elapsedSeconds = 0;
  let remainingSeconds = result.time_limit_seconds;

  if (result.puzzle_started_at) {
    const startTime = new Date(result.puzzle_started_at).getTime();
    elapsedSeconds = Math.floor((Date.now() - startTime) / 1000);
    remainingSeconds = Math.max(0, result.time_limit_seconds - elapsedSeconds);
  }

  return {
    puzzleId,
    puzzleTitle: result.puzzle_title,
    startedAt: result.puzzle_started_at,
    timeLimit: result.time_limit_seconds,
    elapsedSeconds,
    remainingSeconds,
    isExpired: result.time_expired || remainingSeconds <= 0,
    isCompleted: result.is_completed
  };
}

/**
 * Lock submission if time expired
 */
async function canSubmit(teamId, puzzleId) {
  const status = await checkPuzzleExpired(teamId, puzzleId);
  
  if (status.expired) {
    return { canSubmit: false, reason: 'Time expired for this puzzle' };
  }
  
  if (status.completed) {
    return { canSubmit: false, reason: 'Puzzle already completed' };
  }

  return { canSubmit: true };
}

module.exports = {
  startPuzzleTimer,
  checkPuzzleExpired,
  getPuzzleTimerStatus,
  canSubmit
};
