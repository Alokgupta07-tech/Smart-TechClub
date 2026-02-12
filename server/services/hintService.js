// server/services/hintService.js
const db = require('../config/db');
const { supabaseAdmin } = require('../config/supabase');
const { v4: uuidv4 } = require('uuid');
const { notifyHintPenalty } = require('./notificationService');

const USE_SUPABASE = process.env.USE_SUPABASE === 'true';

/**
 * Progressive Hint Service
 * Handles sequential hint unlocking with escalating penalties
 */

/**
 * Get available hints for a puzzle based on time elapsed and previous hints used
 */
async function getAvailableHints(teamId, puzzleId) {
  let hints, progress;

  if (USE_SUPABASE) {
    try {
      // Get all hints for the puzzle
      const { data: hintsData, error: hintsErr } = await supabaseAdmin
        .from('hints')
        .select('*')
        .eq('puzzle_id', puzzleId)
        .eq('is_active', true)
        .order('hint_number');
      if (hintsErr) throw hintsErr;

      // Get used hint IDs for this team
      const { data: usageData, error: usageErr } = await supabaseAdmin
        .from('hint_usage')
        .select('hint_id')
        .eq('team_id', teamId);
      if (usageErr) throw usageErr;

      const usedHintIds = (usageData || []).map(r => r.hint_id);
      hints = (hintsData || []).map(hint => ({
        ...hint,
        is_used: usedHintIds.includes(hint.id)
      }));

      // Get team's progress on this puzzle
      const { data: progressData, error: progressErr } = await supabaseAdmin
        .from('team_progress')
        .select('puzzle_started_at, last_hint_number')
        .eq('team_id', teamId)
        .eq('puzzle_id', puzzleId)
        .maybeSingle();
      if (progressErr) throw progressErr;
      progress = progressData;
    } catch (err) {
      console.error('Supabase getAvailableHints error, falling back to MySQL:', err.message);
      return getAvailableHintsMysql(teamId, puzzleId);
    }
  } else {
    return getAvailableHintsMysql(teamId, puzzleId);
  }

  if (!progress || !progress.puzzle_started_at) {
    return { hints: [], nextHintUnlockIn: null };
  }

  const elapsedSeconds = Math.floor((Date.now() - new Date(progress.puzzle_started_at).getTime()) / 1000);
  const lastHintNumber = progress.last_hint_number || 0;

  // Determine which hints are available
  const availableHints = hints.map((hint, index) => {
    const isUnlocked = hint.is_used || (
      index === lastHintNumber &&
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

/** MySQL fallback for getAvailableHints */
async function getAvailableHintsMysql(teamId, puzzleId) {
  const [hints] = await db.query(`
    SELECT h.*, 
      CASE WHEN hu.id IS NOT NULL THEN true ELSE false END as is_used
    FROM hints h
    LEFT JOIN hint_usage hu ON h.id = hu.hint_id AND hu.team_id = ?
    WHERE h.puzzle_id = ? AND h.is_active = true
    ORDER BY h.hint_number ASC
  `, [teamId, puzzleId]);

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

  const availableHints = hints.map((hint, index) => {
    const isUnlocked = hint.is_used || (
      index === lastHintNumber &&
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
  if (USE_SUPABASE) {
    try {
      // Get the hint
      const { data: hint, error: hintErr } = await supabaseAdmin
        .from('hints')
        .select('*')
        .eq('id', hintId)
        .eq('puzzle_id', puzzleId)
        .maybeSingle();
      if (hintErr) throw hintErr;
      if (!hint) throw new Error('Hint not found');

      // Check if hint was already used
      const { data: existing, error: existErr } = await supabaseAdmin
        .from('hint_usage')
        .select('id')
        .eq('team_id', teamId)
        .eq('hint_id', hintId)
        .maybeSingle();
      if (existErr) throw existErr;
      if (existing) throw new Error('Hint already used');

      // Verify this is the next sequential hint
      const { data: progress, error: progErr } = await supabaseAdmin
        .from('team_progress')
        .select('last_hint_number, hints_used')
        .eq('team_id', teamId)
        .eq('puzzle_id', puzzleId)
        .maybeSingle();
      if (progErr) throw progErr;

      const lastHintNumber = progress?.last_hint_number || 0;
      if (hint.hint_number !== lastHintNumber + 1) {
        throw new Error('Hints must be unlocked in order');
      }

      // Calculate penalty with multiplier
      const penaltySeconds = Math.round(hint.time_penalty_seconds * hint.penalty_multiplier);

      // Record hint usage
      const { error: insertErr } = await supabaseAdmin
        .from('hint_usage')
        .insert({
          id: uuidv4(),
          team_id: teamId,
          hint_id: hintId,
          puzzle_id: puzzleId,
          time_penalty_applied: penaltySeconds
        });
      if (insertErr) throw insertErr;

      // Update team's hints used count (fetch then increment)
      const { data: teamData, error: teamFetchErr } = await supabaseAdmin
        .from('teams')
        .select('hints_used')
        .eq('id', teamId)
        .maybeSingle();
      if (teamFetchErr) throw teamFetchErr;

      const currentHintsUsed = teamData?.hints_used || 0;
      const { error: teamUpdateErr } = await supabaseAdmin
        .from('teams')
        .update({ hints_used: currentHintsUsed + 1 })
        .eq('id', teamId);
      if (teamUpdateErr) throw teamUpdateErr;

      // Update progress with last hint number
      const currentProgressHints = progress?.hints_used || 0;
      const { error: progUpdateErr } = await supabaseAdmin
        .from('team_progress')
        .update({
          last_hint_number: hint.hint_number,
          hints_used: currentProgressHints + 1
        })
        .eq('team_id', teamId)
        .eq('puzzle_id', puzzleId);
      if (progUpdateErr) throw progUpdateErr;

      // Send notification
      await notifyHintPenalty(teamId, hint.hint_number, penaltySeconds);

      // Log activity
      const { error: logErr } = await supabaseAdmin
        .from('activity_logs')
        .insert({
          id: uuidv4(),
          team_id: teamId,
          action_type: 'hint_use',
          description: `Used hint ${hint.hint_number} (penalty: ${penaltySeconds}s)`,
          puzzle_id: puzzleId,
          metadata: { hintNumber: hint.hint_number, penalty: penaltySeconds }
        });
      if (logErr) throw logErr;

      return {
        hintText: hint.hint_text,
        hintNumber: hint.hint_number,
        penaltySeconds
      };
    } catch (err) {
      // Re-throw business logic errors
      if (err.message === 'Hint not found' || err.message === 'Hint already used' || err.message === 'Hints must be unlocked in order') {
        throw err;
      }
      console.error('Supabase useHint error, falling back to MySQL:', err.message);
      return useHintMysql(teamId, puzzleId, hintId);
    }
  } else {
    return useHintMysql(teamId, puzzleId, hintId);
  }
}

/** MySQL fallback for useHint */
async function useHintMysql(teamId, puzzleId, hintId) {
  const [[hint]] = await db.query(`
    SELECT * FROM hints WHERE id = ? AND puzzle_id = ?
  `, [hintId, puzzleId]);

  if (!hint) {
    throw new Error('Hint not found');
  }

  const [[existing]] = await db.query(`
    SELECT id FROM hint_usage WHERE team_id = ? AND hint_id = ?
  `, [teamId, hintId]);

  if (existing) {
    throw new Error('Hint already used');
  }

  const [[progress]] = await db.query(`
    SELECT last_hint_number FROM team_progress WHERE team_id = ? AND puzzle_id = ?
  `, [teamId, puzzleId]);

  const lastHintNumber = progress?.last_hint_number || 0;
  if (hint.hint_number !== lastHintNumber + 1) {
    throw new Error('Hints must be unlocked in order');
  }

  const penaltySeconds = Math.round(hint.time_penalty_seconds * hint.penalty_multiplier);

  await db.query(`
    INSERT INTO hint_usage (id, team_id, hint_id, puzzle_id, time_penalty_applied)
    VALUES (UUID(), ?, ?, ?, ?)
  `, [teamId, hintId, puzzleId, penaltySeconds]);

  await db.query(`
    UPDATE teams SET hints_used = hints_used + 1 WHERE id = ?
  `, [teamId]);

  await db.query(`
    UPDATE team_progress 
    SET last_hint_number = ?, hints_used = hints_used + 1
    WHERE team_id = ? AND puzzle_id = ?
  `, [hint.hint_number, teamId, puzzleId]);

  await notifyHintPenalty(teamId, hint.hint_number, penaltySeconds);

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
  if (USE_SUPABASE) {
    try {
      const { data, error } = await supabaseAdmin
        .from('hint_usage')
        .select('time_penalty_applied')
        .eq('team_id', teamId);
      if (error) throw error;

      return (data || []).reduce((sum, r) => sum + (r.time_penalty_applied || 0), 0);
    } catch (err) {
      console.error('Supabase getTotalHintPenalty error, falling back to MySQL:', err.message);
      return getTotalHintPenaltyMysql(teamId);
    }
  } else {
    return getTotalHintPenaltyMysql(teamId);
  }
}

/** MySQL fallback for getTotalHintPenalty */
async function getTotalHintPenaltyMysql(teamId) {
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
