// server/services/puzzleTimerService.js
const db = require('../config/db');
const { supabaseAdmin } = require('../config/supabase');
const { v4: uuidv4 } = require('uuid');

const USE_SUPABASE = process.env.USE_SUPABASE === 'true';

/**
 * Puzzle Timer Service
 * Handles per-puzzle time limits and expiration
 */

/**
 * Start puzzle timer for a team
 */
async function startPuzzleTimer(teamId, puzzleId) {
  if (USE_SUPABASE) {
    try {
      // Check if already started
      const { data: existing, error: selErr } = await supabaseAdmin
        .from('team_progress')
        .select('puzzle_started_at')
        .eq('team_id', teamId)
        .eq('puzzle_id', puzzleId)
        .maybeSingle();
      if (selErr) throw selErr;

      if (existing?.puzzle_started_at) {
        return { alreadyStarted: true, startedAt: existing.puzzle_started_at };
      }

      // Start the timer
      const now = new Date().toISOString();
      const { error: updErr } = await supabaseAdmin
        .from('team_progress')
        .update({ puzzle_started_at: now })
        .eq('team_id', teamId)
        .eq('puzzle_id', puzzleId);
      if (updErr) throw updErr;

      // Log activity
      const { error: logErr } = await supabaseAdmin
        .from('activity_logs')
        .insert({
          id: uuidv4(),
          team_id: teamId,
          action_type: 'puzzle_start',
          description: 'Started puzzle timer',
          puzzle_id: puzzleId
        });
      if (logErr) console.error('Failed to insert activity_log:', logErr.message);

      return { alreadyStarted: false, startedAt: new Date(now) };
    } catch (err) {
      console.error('Supabase startPuzzleTimer error, falling back to MySQL:', err.message);
      return startPuzzleTimerMysql(teamId, puzzleId);
    }
  } else {
    return startPuzzleTimerMysql(teamId, puzzleId);
  }
}

/** MySQL fallback for startPuzzleTimer */
async function startPuzzleTimerMysql(teamId, puzzleId) {
  const [[existing]] = await db.query(`
    SELECT puzzle_started_at FROM team_progress
    WHERE team_id = ? AND puzzle_id = ?
  `, [teamId, puzzleId]);

  if (existing?.puzzle_started_at) {
    return { alreadyStarted: true, startedAt: existing.puzzle_started_at };
  }

  await db.query(`
    UPDATE team_progress
    SET puzzle_started_at = NOW()
    WHERE team_id = ? AND puzzle_id = ?
  `, [teamId, puzzleId]);

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
  if (USE_SUPABASE) {
    try {
      // Get team_progress
      const { data: tp, error: tpErr } = await supabaseAdmin
        .from('team_progress')
        .select('puzzle_started_at, time_expired, is_completed')
        .eq('team_id', teamId)
        .eq('puzzle_id', puzzleId)
        .maybeSingle();
      if (tpErr) throw tpErr;

      if (!tp) {
        return { expired: false, exists: false };
      }

      if (tp.is_completed) {
        return { expired: false, completed: true };
      }

      if (tp.time_expired) {
        return { expired: true, markedExpired: true };
      }

      // Get puzzle time limit
      const { data: puzzle, error: pErr } = await supabaseAdmin
        .from('puzzles')
        .select('time_limit_seconds')
        .eq('id', puzzleId)
        .maybeSingle();
      if (pErr) throw pErr;

      const timeLimitSeconds = puzzle?.time_limit_seconds;

      if (!tp.puzzle_started_at || !timeLimitSeconds) {
        return { expired: false, noLimit: true };
      }

      const startTime = new Date(tp.puzzle_started_at).getTime();
      const elapsedSeconds = Math.floor((Date.now() - startTime) / 1000);
      const remainingSeconds = timeLimitSeconds - elapsedSeconds;

      if (remainingSeconds <= 0) {
        // Mark as expired
        const { error: updErr } = await supabaseAdmin
          .from('team_progress')
          .update({ time_expired: true })
          .eq('team_id', teamId)
          .eq('puzzle_id', puzzleId);
        if (updErr) throw updErr;

        return { expired: true, elapsedSeconds, timeLimit: timeLimitSeconds };
      }

      return {
        expired: false,
        elapsedSeconds,
        remainingSeconds,
        timeLimit: timeLimitSeconds
      };
    } catch (err) {
      console.error('Supabase checkPuzzleExpired error, falling back to MySQL:', err.message);
      return checkPuzzleExpiredMysql(teamId, puzzleId);
    }
  } else {
    return checkPuzzleExpiredMysql(teamId, puzzleId);
  }
}

/** MySQL fallback for checkPuzzleExpired */
async function checkPuzzleExpiredMysql(teamId, puzzleId) {
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
  if (USE_SUPABASE) {
    try {
      // Get team_progress
      const { data: tp, error: tpErr } = await supabaseAdmin
        .from('team_progress')
        .select('puzzle_started_at, time_expired, is_completed')
        .eq('team_id', teamId)
        .eq('puzzle_id', puzzleId)
        .maybeSingle();
      if (tpErr) throw tpErr;

      if (!tp) return null;

      // Get puzzle details
      const { data: puzzle, error: pErr } = await supabaseAdmin
        .from('puzzles')
        .select('time_limit_seconds, title')
        .eq('id', puzzleId)
        .maybeSingle();
      if (pErr) throw pErr;

      const timeLimitSeconds = puzzle?.time_limit_seconds || 0;

      let elapsedSeconds = 0;
      let remainingSeconds = timeLimitSeconds;

      if (tp.puzzle_started_at) {
        const startTime = new Date(tp.puzzle_started_at).getTime();
        elapsedSeconds = Math.floor((Date.now() - startTime) / 1000);
        remainingSeconds = Math.max(0, timeLimitSeconds - elapsedSeconds);
      }

      return {
        puzzleId,
        puzzleTitle: puzzle?.title || null,
        startedAt: tp.puzzle_started_at,
        timeLimit: timeLimitSeconds,
        elapsedSeconds,
        remainingSeconds,
        isExpired: tp.time_expired || remainingSeconds <= 0,
        isCompleted: tp.is_completed
      };
    } catch (err) {
      console.error('Supabase getPuzzleTimerStatus error, falling back to MySQL:', err.message);
      return getPuzzleTimerStatusMysql(teamId, puzzleId);
    }
  } else {
    return getPuzzleTimerStatusMysql(teamId, puzzleId);
  }
}

/** MySQL fallback for getPuzzleTimerStatus */
async function getPuzzleTimerStatusMysql(teamId, puzzleId) {
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
