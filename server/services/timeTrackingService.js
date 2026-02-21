/**
 * Time Tracking Service
 * ======================
 * Handles all time-related operations for teams and puzzles
 * - Accurate per-question timing with pause/resume
 * - Session management
 * - Skip functionality with penalties
 * - Admin analytics
 * 
 * All times are SERVER-VALIDATED - never trust frontend time
 */

const db = require('../config/db');
const { v4: uuidv4 } = require('uuid');

/**
 * Check if error is a table/column not found error
 * Works for both MySQL and PostgreSQL/Supabase
 */
function isTableNotFoundError(error) {
  if (!error) return false;
  // MySQL errors
  if (error.code === 'ER_NO_SUCH_TABLE' || error.code === 'ER_BAD_FIELD_ERROR') return true;
  // PostgreSQL errors
  if (error.code === '42P01' || error.code === '42703') return true;
  // Supabase PostgREST errors
  if (error.code === 'PGRST205' || error.code === 'PGRST300') return true;
  // Message-based detection
  if (error.message && (
    error.message.includes('does not exist') ||
    error.message.includes('Could not find') ||
    error.message.includes('relation') && error.message.includes('not exist')
  )) return true;
  return false;
}

/**
 * Initialize or get team session
 * Creates a session record if one doesn't exist
 */
async function getOrCreateTeamSession(teamId) {
  try {
    const [existing] = await db.query(
      'SELECT * FROM team_sessions WHERE team_id = ?',
      [teamId]
    );
    
    if (existing.length > 0) {
      return existing[0];
    }
    
    // Create new session - use is_active=0 instead of status='not_started'
    const sessionId = uuidv4();
    await db.query(
      `INSERT INTO team_sessions (id, team_id, is_active, session_start, total_time_seconds, questions_completed, questions_skipped, total_attempts, total_hints_used) 
       VALUES (?, ?, 0, NULL, 0, 0, 0, 0, 0)`,
      [sessionId, teamId]
    );
    
    const [newSession] = await db.query(
      'SELECT * FROM team_sessions WHERE id = ?',
      [sessionId]
    );
    return newSession[0];
  } catch (error) {
    // If table doesn't exist, return a default session object
    if (isTableNotFoundError(error)) {
      console.log('team_sessions table issue, returning default session');
      return {
        id: null,
        team_id: teamId,
        is_active: 0,
        session_start: null,
        session_end: null,
        total_time_seconds: 0,
        questions_completed: 0,
        questions_skipped: 0,
        total_penalty_seconds: 0,
        total_hints_used: 0
      };
    }
    throw error;
  }
}

/**
 * Get or create question progress record
 */
async function getOrCreateQuestionProgress(teamId, puzzleId) {
  const [existing] = await db.query(
    'SELECT * FROM team_question_progress WHERE team_id = ? AND puzzle_id = ?',
    [teamId, puzzleId]
  );
  
  if (existing.length > 0) {
    return existing[0];
  }
  
  // Create new progress record
  const progressId = uuidv4();
  await db.query(
    `INSERT INTO team_question_progress (id, team_id, puzzle_id, status) 
     VALUES (?, ?, ?, 'NOT_STARTED')`,
    [progressId, teamId, puzzleId]
  );
  
  const [newProgress] = await db.query(
    'SELECT * FROM team_question_progress WHERE id = ?',
    [progressId]
  );
  return newProgress[0];
}

/**
 * Log a time tracking event for audit purposes
 */
async function logTimeEvent(teamId, puzzleId, eventType, timeBefore, timeAfter, metadata = {}, req = null) {
  const eventId = uuidv4();
  const ipAddress = req?.ip || req?.connection?.remoteAddress || null;
  const userAgent = req?.get?.('User-Agent') || null;
  
  await db.query(
    `INSERT INTO time_tracking_events 
     (id, team_id, puzzle_id, event_type, time_before_event_seconds, time_after_event_seconds, 
      time_delta_seconds, metadata, ip_address, user_agent)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      eventId, teamId, puzzleId, eventType, timeBefore, timeAfter,
      timeAfter - timeBefore, JSON.stringify(metadata), ipAddress, userAgent
    ]
  );
}

/**
 * START QUESTION
 * Called when team begins working on a question
 */
async function startQuestion(teamId, puzzleId, req = null) {
  const connection = await db.getConnection();
  
  try {
    await connection.beginTransaction();
    
    // Get current progress
    let progress = await getOrCreateQuestionProgress(teamId, puzzleId);
    
    // Validate state transition (handle both upper and lowercase)
    const statusUpper = (progress.status || '').toUpperCase();
    if (statusUpper === 'COMPLETED') {
      throw new Error('Question already completed');
    }
    
    if (statusUpper === 'ACTIVE' || statusUpper === 'IN_PROGRESS') {
      throw new Error('Question already in progress');
    }
    
    const now = new Date();
    const timeBefore = progress.time_spent_seconds || 0;
    
    // Update question progress (only use schema-valid columns)
    await connection.query(
      `UPDATE team_question_progress SET status = 'IN_PROGRESS', started_at = ?, updated_at = ? WHERE team_id = ? AND puzzle_id = ?`,
      [now, now, teamId, puzzleId]
    );
    
    // Update team's current puzzle (optional column)
    try {
      await connection.query(
        `UPDATE teams SET current_puzzle_id = ? WHERE id = ?`,
        [puzzleId, teamId]
      );
    } catch (e) { /* column might not exist */ }
    
    await connection.commit();
    
    // Log event (non-critical)
    try {
      await logTimeEvent(teamId, puzzleId, 'question_start', timeBefore, timeBefore, {
        resumed_from_skip: statusUpper === 'SKIPPED'
      }, req);
    } catch (e) { /* non-critical */ }
    
    // Get updated progress
    const [updated] = await db.query(
      'SELECT * FROM team_question_progress WHERE team_id = ? AND puzzle_id = ?',
      [teamId, puzzleId]
    );
    
    return {
      success: true,
      message: 'Question started',
      progress: updated[0]
    };
    
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

/**
 * PAUSE QUESTION
 * Called when team pauses (or leaves) a question
 */
async function pauseQuestion(teamId, puzzleId, req = null) {
  const connection = await db.getConnection();
  
  try {
    await connection.beginTransaction();
    
    // Get current progress
    const [progressRows] = await connection.query(
      'SELECT * FROM team_question_progress WHERE team_id = ? AND puzzle_id = ?',
      [teamId, puzzleId]
    );
    
    if (progressRows.length === 0) {
      throw new Error('No progress record found');
    }
    
    const progress = progressRows[0];
    
    // Validate state (handle both upper and lowercase)
    const statusUpper = (progress.status || '').toUpperCase();
    if (statusUpper !== 'ACTIVE' && statusUpper !== 'IN_PROGRESS') {
      throw new Error(`Cannot pause question in '${progress.status}' state`);
    }
    
    if (!progress.started_at) {
      throw new Error('Question timer not started');
    }
    
    const now = new Date();
    const startedAt = new Date(progress.started_at);
    const elapsedSeconds = Math.floor((now - startedAt) / 1000);
    const newTotalTime = (progress.time_spent_seconds || 0) + elapsedSeconds;
    
    // Update progress (only use schema-valid columns)
    await connection.query(
      `UPDATE team_question_progress SET status = 'NOT_STARTED', started_at = NULL, time_spent_seconds = ?, updated_at = ? WHERE team_id = ? AND puzzle_id = ?`,
      [newTotalTime, now, teamId, puzzleId]
    );
    
    await connection.commit();
    
    // Log event
    await logTimeEvent(teamId, puzzleId, 'question_pause', 
      progress.time_spent_seconds, newTotalTime, { elapsed_this_session: elapsedSeconds }, req);
    
    return {
      success: true,
      message: 'Question paused',
      time_spent_seconds: newTotalTime,
      elapsed_this_session: elapsedSeconds
    };
    
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

/**
 * RESUME QUESTION
 * Called when team resumes a paused question
 */
async function resumeQuestion(teamId, puzzleId, req = null) {
  const connection = await db.getConnection();
  
  try {
    await connection.beginTransaction();
    
    // Get current progress
    const [progressRows] = await connection.query(
      'SELECT * FROM team_question_progress WHERE team_id = ? AND puzzle_id = ?',
      [teamId, puzzleId]
    );
    
    if (progressRows.length === 0) {
      throw new Error('No progress record found');
    }
    
    const progress = progressRows[0];
    
    // Validate state
    if (progress.status === 'completed') {
      throw new Error('Question already completed');
    }
    
    if (progress.status === 'active') {
      throw new Error('Question already active');
    }
    
    const now = new Date();
    
    // Calculate pause duration if applicable
    let pauseDuration = 0;
    if (progress.last_paused_at) {
      pauseDuration = Math.floor((now - new Date(progress.last_paused_at)) / 1000);
    }
    
    // Update progress (only use schema-valid columns)
    await connection.query(
      `UPDATE team_question_progress SET status = 'IN_PROGRESS', started_at = ?, updated_at = ? WHERE team_id = ? AND puzzle_id = ?`,
      [now, now, teamId, puzzleId]
    );
    
    // Update team state (optional column)
    try {
      await connection.query(
        `UPDATE teams SET current_puzzle_id = ? WHERE id = ?`,
        [puzzleId, teamId]
      );
    } catch (e) { /* column might not exist */ }
    
    await connection.commit();
    
    // Log event
    await logTimeEvent(teamId, puzzleId, 'question_resume',
      progress.time_spent_seconds, progress.time_spent_seconds, 
      { pause_duration: pauseDuration }, req);
    
    return {
      success: true,
      message: 'Question resumed',
      time_spent_seconds: progress.time_spent_seconds,
      pause_duration: pauseDuration
    };
    
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

/**
 * COMPLETE QUESTION
 * Called when team correctly answers a question
 */
async function completeQuestion(teamId, puzzleId, req = null) {
  const connection = await db.getConnection();
  
  try {
    await connection.beginTransaction();
    
    // Get current progress
    const [progressRows] = await connection.query(
      'SELECT * FROM team_question_progress WHERE team_id = ? AND puzzle_id = ?',
      [teamId, puzzleId]
    );
    
    if (progressRows.length === 0) {
      throw new Error('No progress record found');
    }
    
    const progress = progressRows[0];
    
    // Validate state (handle both upper and lowercase)
    const statusUpper = (progress.status || '').toUpperCase();
    if (statusUpper === 'COMPLETED') {
      throw new Error('Question already completed');
    }
    
    const now = new Date();
    let finalTime = progress.time_spent_seconds || 0;
    
    // If question was active/in_progress, add remaining time
    if ((statusUpper === 'ACTIVE' || statusUpper === 'IN_PROGRESS') && progress.started_at) {
      const startedAt = new Date(progress.started_at);
      const elapsedSeconds = Math.floor((now - startedAt) / 1000);
      finalTime += elapsedSeconds;
    }
    
    // Update progress (only use schema-valid columns)
    await connection.query(
      `UPDATE team_question_progress SET status = 'COMPLETED', started_at = NULL, completed_at = ?, time_spent_seconds = ?, correct = true, updated_at = ? WHERE team_id = ? AND puzzle_id = ?`,
      [now, finalTime, now, teamId, puzzleId]
    );
    
    // Clear current puzzle from team (optional column)
    try {
      await connection.query(
        `UPDATE teams SET current_puzzle_id = NULL WHERE id = ?`,
        [teamId]
      );
    } catch (e) { /* column might not exist */ }
    
    await connection.commit();
    
    // Log event
    await logTimeEvent(teamId, puzzleId, 'question_complete',
      progress.time_spent_seconds, finalTime, { final_time: finalTime }, req);
    
    // Recalculate effective time
    await recalculateTeamEffectiveTime(teamId);
    
    return {
      success: true,
      message: 'Question completed',
      time_spent_seconds: finalTime
    };
    
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

/**
 * SKIP QUESTION
 * Called when team skips a question to move to next
 */
async function skipQuestion(teamId, puzzleId, req = null) {
  try {
    // Check if skipping is enabled and get settings (with fallback defaults)
    let skipEnabled = true;
    let maxSkips = 3;
    let skipPenalty = 300;
    
    try {
      const [settings] = await db.query(
        `SELECT skip_enabled, max_skips_per_team, skip_penalty_seconds FROM game_settings WHERE id = 1`
      );
      
      if (settings.length > 0) {
        skipEnabled = settings[0].skip_enabled !== false && settings[0].skip_enabled !== 0;
        maxSkips = settings[0].max_skips_per_team || 3;
        skipPenalty = settings[0].skip_penalty_seconds || 300;
      }
    } catch (settingsError) {
      console.log('game_settings table not found, using defaults');
    }
    
    if (!skipEnabled) {
      throw new Error('Skipping is currently disabled');
    }
    
    // Ensure team session exists
    await getOrCreateTeamSession(teamId);
    
    // Count team's current skips
    let currentSkips = 0;
    try {
      const [skipCount] = await db.query(
        `SELECT questions_skipped FROM team_sessions WHERE team_id = ?`,
        [teamId]
      );
      currentSkips = skipCount.length > 0 ? (skipCount[0].questions_skipped || 0) : 0;
    } catch (err) {
      console.log('Error checking skip count, assuming 0');
    }
    
    // Get or create progress record
    let progress;
    try {
      const [progressRows] = await db.query(
        'SELECT * FROM team_question_progress WHERE team_id = ? AND puzzle_id = ?',
        [teamId, puzzleId]
      );
      
      if (progressRows.length === 0) {
        // Create progress record (only use columns that exist in schema)
        const progressId = uuidv4();
        await db.query(
          `INSERT INTO team_question_progress (id, team_id, puzzle_id, status, time_spent_seconds) 
           VALUES (?, ?, ?, 'NOT_STARTED', 0)`,
          [progressId, teamId, puzzleId]
        );
        progress = { 
          id: progressId, 
          status: 'NOT_STARTED', 
          time_spent_seconds: 0, 
          attempts: 0,
          started_at: null
        };
      } else {
        progress = progressRows[0];
      }
    } catch (progressError) {
      console.log('team_question_progress error:', progressError.message);
      progress = { 
        status: 'NOT_STARTED', 
        time_spent_seconds: 0, 
        attempts: 0,
        started_at: null
      };
    }
    
    // Validate state (handle both upper and lowercase)
    const statusUpper = (progress.status || '').toUpperCase();
    if (statusUpper === 'COMPLETED') {
      throw new Error('Cannot skip completed question');
    }
    
    const now = new Date();
    let timeSpent = progress.time_spent_seconds || 0;
    
    // If active/in_progress, calculate elapsed time
    if ((statusUpper === 'ACTIVE' || statusUpper === 'IN_PROGRESS') && progress.started_at) {
      const startedAt = new Date(progress.started_at);
      const elapsedSeconds = Math.floor((now - startedAt) / 1000);
      timeSpent += elapsedSeconds;
    }
    
    // Update progress (only use columns that exist in schema)
    try {
      await db.query(
        `UPDATE team_question_progress SET status = 'SKIPPED', started_at = NULL, time_spent_seconds = ?, updated_at = ? WHERE team_id = ? AND puzzle_id = ?`,
        [timeSpent, now, teamId, puzzleId]
      );
    } catch (updateErr) {
      console.log('Error updating progress:', updateErr.message);
    }
    
    // Update session skip count (non-critical - table may not exist)
    try {
      await db.query(
        `UPDATE team_sessions SET questions_skipped = COALESCE(questions_skipped, 0) + 1, updated_at = ? WHERE team_id = ?`,
        [now, teamId]
      );
    } catch (sessionErr) {
      console.log('Error updating session:', sessionErr.message);
    }
    
    // Clear any other IN_PROGRESS puzzles for this team (since we're about to set next as IN_PROGRESS)
    try {
      await db.query(
        `UPDATE team_question_progress SET status = 'NOT_STARTED', updated_at = ? WHERE team_id = ? AND status = 'IN_PROGRESS' AND puzzle_id != ?`,
        [now, teamId, puzzleId]
      );
    } catch (clearErr) {
      console.log('Error clearing old IN_PROGRESS:', clearErr.message);
    }
    
    // Get next puzzle after the skipped one - key for auto-advance
    let nextPuzzle = null;
    try {
      const [currentPuzzle] = await db.query(
        'SELECT level, puzzle_number FROM puzzles WHERE id = ?',
        [puzzleId]
      );
      
      if (currentPuzzle.length > 0) {
        // Find next puzzle in the same level
        const [nextPuzzles] = await db.query(
          `SELECT id, puzzle_number, title FROM puzzles 
           WHERE level = ? AND puzzle_number > ? AND is_active = true
           ORDER BY puzzle_number ASC LIMIT 1`,
          [currentPuzzle[0].level, currentPuzzle[0].puzzle_number]
        );
        
        if (nextPuzzles.length > 0) {
          nextPuzzle = nextPuzzles[0];
          // Create progress for next puzzle if needed
          const [existingProgress] = await db.query(
            'SELECT id FROM team_question_progress WHERE team_id = ? AND puzzle_id = ?',
            [teamId, nextPuzzle.id]
          );
          
          if (existingProgress.length === 0) {
            const newId = uuidv4();
            await db.query(
              `INSERT INTO team_question_progress (id, team_id, puzzle_id, status, time_spent_seconds)
               VALUES (?, ?, ?, 'IN_PROGRESS', 0)`,
              [newId, teamId, nextPuzzle.id]
            );
          } else {
            // Mark next puzzle as in-progress
            await db.query(
              `UPDATE team_question_progress SET status = 'IN_PROGRESS', started_at = ? WHERE team_id = ? AND puzzle_id = ?`,
              [now, teamId, nextPuzzle.id]
            );
          }
        }
      }
    } catch (nextErr) {
      console.log('Error setting up next puzzle:', nextErr.message);
    }
    
    // Log event (non-critical)
    try {
      await logTimeEvent(teamId, puzzleId, 'question_skip',
        progress.time_spent_seconds || 0, timeSpent, 
        { penalty_applied: skipPenalty }, req);
    } catch (logErr) {
      console.log('Error logging skip event:', logErr.message);
    }
    
    // Recalculate effective time (non-critical)
    try {
      await recalculateTeamEffectiveTime(teamId);
    } catch (recalcErr) {
      console.log('Error recalculating time:', recalcErr.message);
    }
    
    return {
      success: true,
      message: 'Question skipped. You can return to it later from the Question Navigator.',
      time_spent_seconds: timeSpent,
      skip_penalty_seconds: skipPenalty,
      total_skips: currentSkips + 1,
      max_skips: maxSkips,
      next_puzzle: nextPuzzle
    };
    
  } catch (error) {
    console.error('Skip question error:', error);
    throw error;
  }
}

/**
 * UNSKIP QUESTION (Return to skipped question)
 * Called when team returns to a previously skipped question
 */
async function unskipQuestion(teamId, puzzleId, req = null) {
  try {
    // Get current progress
    const [progressRows] = await db.query(
      'SELECT * FROM team_question_progress WHERE team_id = ? AND puzzle_id = ?',
      [teamId, puzzleId]
    );
    
    if (progressRows.length === 0) {
      throw new Error('No progress record found for this question');
    }
    
    const progress = progressRows[0];
    
    // Validate state (handle both upper and lowercase)
    const statusUpper = (progress.status || '').toUpperCase();
    if (statusUpper !== 'SKIPPED') {
      throw new Error('Question is not in skipped state');
    }
    
    const now = new Date();
    
    // Resume the question (make it in-progress again)
    try {
      await db.query(
        `UPDATE team_question_progress SET status = 'IN_PROGRESS', started_at = ?, updated_at = ? WHERE team_id = ? AND puzzle_id = ?`,
        [now, now, teamId, puzzleId]
      );
    } catch (updateErr) {
      console.log('Error updating progress:', updateErr.message);
    }
    
    // Update team state (optional column)
    try {
      await db.query(
        `UPDATE teams SET current_puzzle_id = ? WHERE id = ?`,
        [puzzleId, teamId]
      );
    } catch (teamErr) {
      // Column might not exist
    }
    
    // Update session
    try {
      await db.query(
        `UPDATE team_sessions 
         SET status = 'active',
             last_activity_at = ?
         WHERE team_id = ?`,
        [now, teamId]
      );
    } catch (sessionErr) {
      console.log('Error updating session:', sessionErr.message);
    }
    
    // Log event (non-critical)
    try {
      await logTimeEvent(teamId, puzzleId, 'question_unskip',
        progress.time_spent_seconds || 0, progress.time_spent_seconds || 0, {}, req);
    } catch (logErr) {
      console.log('Error logging unskip event:', logErr.message);
    }
    
    return {
      success: true,
      message: 'Returned to skipped question',
      time_spent_seconds: progress.time_spent_seconds || 0,
      skip_penalty_already_applied: progress.time_penalty_seconds || 0
    };
    
  } catch (error) {
    console.error('Unskip question error:', error);
    throw error;
  }
}

/**
 * END SESSION
 * Called when team finishes the game or admin ends their session
 */
async function endSession(teamId, req = null) {
  const connection = await db.getConnection();
  
  try {
    await connection.beginTransaction();
    
    const now = new Date();
    
    // Pause any active question first
    const [activeQuestion] = await connection.query(
      `SELECT puzzle_id FROM team_question_progress WHERE team_id = ? AND status = 'IN_PROGRESS'`,
      [teamId]
    );
    
    if (activeQuestion.length > 0) {
      // Calculate final time for active question
      const [progress] = await connection.query(
        'SELECT * FROM team_question_progress WHERE team_id = ? AND puzzle_id = ?',
        [teamId, activeQuestion[0].puzzle_id]
      );
      
      if (progress[0].started_at) {
        const startedAt = new Date(progress[0].started_at);
        const elapsedSeconds = Math.floor((now - startedAt) / 1000);
        const finalTime = progress[0].time_spent_seconds + elapsedSeconds;
        
        await connection.query(
          `UPDATE team_question_progress SET status = 'NOT_STARTED', started_at = NULL, time_spent_seconds = ?, updated_at = ? WHERE team_id = ? AND puzzle_id = ?`,
          [finalTime, now, teamId, activeQuestion[0].puzzle_id]
        );
      }
    }
    
    // Calculate total time
    const [totalTime] = await connection.query(
      `SELECT SUM(time_spent_seconds) as total FROM team_question_progress WHERE team_id = ?`,
      [teamId]
    );
    
    const [session] = await connection.query(
      'SELECT * FROM team_sessions WHERE team_id = ?',
      [teamId]
    );
    
    // Update session (non-critical)
    try {
      await connection.query(
        `UPDATE team_sessions SET session_end = ?, total_time_seconds = ?, updated_at = ? WHERE team_id = ?`,
        [now, totalTime[0]?.total || 0, now, teamId]
      );
    } catch (e) { /* table may not exist */ }
    
    // Update team
    try {
      await connection.query(
        `UPDATE teams SET status = 'completed', end_time = ? WHERE id = ?`,
        [now, teamId]
      );
    } catch (e) { /* non-critical */ }
    
    await connection.commit();
    
    // Log event
    await logTimeEvent(teamId, null, 'session_end',
      session[0]?.total_time_seconds || 0, totalTime[0]?.total || 0, {}, req);
    
    // Recalculate effective time
    await recalculateTeamEffectiveTime(teamId);
    
    return {
      success: true,
      message: 'Session ended',
      total_time_seconds: totalTime[0]?.total || 0
    };
    
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

/**
 * GET CURRENT TIMER STATE
 * Returns the current timer state for a team's question
 */
async function getTimerState(teamId, puzzleId) {
  // Get progress
  const progress = await getOrCreateQuestionProgress(teamId, puzzleId);
  
  let currentTimeSeconds = progress.time_spent_seconds;
  let isRunning = false;
  
  // If active/in_progress, calculate current elapsed time
  const statusUpper = (progress.status || '').toUpperCase();
  if ((statusUpper === 'ACTIVE' || statusUpper === 'IN_PROGRESS') && progress.started_at) {
    const now = new Date();
    const startedAt = new Date(progress.started_at);
    const elapsedSeconds = Math.floor((now - startedAt) / 1000);
    currentTimeSeconds += elapsedSeconds;
    isRunning = true;
  }
  
  return {
    puzzle_id: puzzleId,
    status: progress.status,
    time_spent_seconds: currentTimeSeconds,
    is_running: isRunning,
    started_at: progress.started_at
  };
}

/**
 * GET TEAM SESSION STATE
 * Returns the complete session state for a team
 */
async function getSessionState(teamId) {
  const USE_SUPABASE = process.env.USE_SUPABASE === 'true';

  // FIX: Use Supabase directly when USE_SUPABASE is true,
  // instead of going through the fragile MySQL-to-Supabase SQL adapter.
  if (USE_SUPABASE) {
    try {
      const { supabaseAdmin } = require('../config/supabase');

      // Get all puzzles for the question list
      const { data: allPuzzles } = await supabaseAdmin
        .from('puzzles')
        .select('id, title, puzzle_number, level')
        .eq('is_active', true)
        .order('level', { ascending: true })
        .order('puzzle_number', { ascending: true });

      // Get team question progress
      let progressRows = [];
      try {
        const { data } = await supabaseAdmin
          .from('team_question_progress')
          .select('puzzle_id, status, time_spent_seconds, started_at, skip_count, time_penalty_seconds')
          .eq('team_id', teamId);
        progressRows = data || [];
      } catch (e) {
        console.log('team_question_progress not available:', e.message);
      }

      // Get submissions to determine correct answers (for completed status)
      let submissions = [];
      try {
        const { data } = await supabaseAdmin
          .from('submissions')
          .select('puzzle_id, is_correct')
          .eq('team_id', teamId)
          .eq('is_correct', true);
        submissions = data || [];
      } catch (e) {}

      const correctPuzzleIds = new Set((submissions || []).map(s => s.puzzle_id));
      const progressMap = {};
      for (const p of progressRows) {
        progressMap[p.puzzle_id] = p;
      }

      // Get team info for session data
      let teamData = null;
      try {
        const { data } = await supabaseAdmin
          .from('teams')
          .select('id, start_time, end_time, hints_used, status')
          .eq('id', teamId)
          .single();
        teamData = data;
      } catch (e) {}

      // Get hints used count
      let totalHintsUsed = 0;
      try {
        const { data: hintUsage } = await supabaseAdmin
          .from('hint_usage')
          .select('id')
          .eq('team_id', teamId);
        totalHintsUsed = (hintUsage || []).length;
      } catch (e) {}

      const now = new Date();
      let currentActiveTime = 0;

      // Build questions from ALL puzzles (not just ones with progress records)
      const questions = (allPuzzles || []).map(puzzle => {
        const progress = progressMap[puzzle.id];
        const hasCorrectSubmission = correctPuzzleIds.has(puzzle.id);

        // Determine status: COMPLETED from progress table OR from correct submissions
        let rawStatus = progress?.status || 'NOT_STARTED';
        if (hasCorrectSubmission && rawStatus !== 'COMPLETED') {
          rawStatus = 'COMPLETED';
        }

        // Normalize status for frontend
        let normalizedStatus = rawStatus.toLowerCase();
        if (normalizedStatus === 'in_progress') normalizedStatus = 'active';

        const timeSpent = progress?.time_spent_seconds || 0;
        if (normalizedStatus === 'active' && progress?.started_at) {
          currentActiveTime += Math.floor((now - new Date(progress.started_at)) / 1000);
        }
        currentActiveTime += timeSpent;

        return {
          puzzle_id: puzzle.id,
          title: puzzle.title,
          level: puzzle.level,
          puzzle_number: puzzle.puzzle_number,
          status: normalizedStatus,
          time_spent_seconds: timeSpent +
            ((normalizedStatus === 'active') && progress?.started_at ? Math.floor((now - new Date(progress.started_at)) / 1000) : 0),
          skip_count: progress?.skip_count || 0,
          time_penalty_seconds: progress?.time_penalty_seconds || 0
        };
      });

      const questionsCompleted = questions.filter(q => q.status === 'completed').length;
      const questionsSkipped = questions.filter(q => q.status === 'skipped').length;

      return {
        session_id: teamId,
        status: teamData?.status === 'active' || teamData?.start_time ? 'active' : 'not_started',
        session_start: teamData?.start_time || null,
        session_end: teamData?.end_time || null,
        total_time_seconds: 0,
        active_time_seconds: currentActiveTime,
        questions_completed: questionsCompleted,
        questions_skipped: questionsSkipped,
        total_penalty_seconds: 0,
        total_hints_used: totalHintsUsed,
        effective_time_seconds: currentActiveTime,
        questions
      };
    } catch (error) {
      console.log('Supabase getSessionState error:', error.message);
      return {
        session_id: null,
        status: 'not_started',
        session_start: null,
        session_end: null,
        total_time_seconds: 0,
        active_time_seconds: 0,
        questions_completed: 0,
        questions_skipped: 0,
        total_penalty_seconds: 0,
        total_hints_used: 0,
        effective_time_seconds: 0,
        questions: []
      };
    }
  }

  // MySQL path (original logic)
  try {
    const session = await getOrCreateTeamSession(teamId);

    // Get all question progress for this team (separate query, no JOIN)
    let questions = [];
    try {
      const [progressRows] = await db.query(
        'SELECT * FROM team_question_progress WHERE team_id = ?',
        [teamId]
      );

      // Get puzzle details separately
      const [puzzleRows] = await db.query(
        'SELECT id, title, puzzle_number, level FROM puzzles WHERE is_active = true',
        []
      );

      // Create a lookup map for puzzles
      const puzzleMap = {};
      for (const p of puzzleRows) {
        puzzleMap[p.id] = p;
      }

      // Join progress with puzzle data in JS
      questions = (progressRows || [])
        .map(tqp => {
          const puzzle = puzzleMap[tqp.puzzle_id];
          if (!puzzle) return null;
          return {
            ...tqp,
            title: puzzle.title,
            puzzle_number: puzzle.puzzle_number,
            level: puzzle.level
          };
        })
        .filter(Boolean)
        .sort((a, b) => {
          if (a.level !== b.level) return a.level - b.level;
          return a.puzzle_number - b.puzzle_number;
        });
    } catch (qErr) {
      if (isTableNotFoundError(qErr)) {
        console.log('team_question_progress table not available');
      } else {
        throw qErr;
      }
    }

    // Calculate current active time if any question is running
    let currentActiveTime = 0;
    const now = new Date();

    for (const q of questions) {
      if (q.status === 'active' && q.started_at) {
        const startedAt = new Date(q.started_at);
        currentActiveTime += Math.floor((now - startedAt) / 1000);
      }
      currentActiveTime += q.time_spent_seconds || 0;
    }

    return {
      session_id: session.id,
      status: session.status || session.is_active ? 'active' : 'not_started',
      session_start: session.session_start,
      session_end: session.session_end,
      total_time_seconds: session.total_time_seconds || 0,
      active_time_seconds: currentActiveTime,
      questions_completed: session.questions_completed || 0,
      questions_skipped: session.questions_skipped || 0,
      total_penalty_seconds: session.total_penalty_seconds || 0,
      total_hints_used: session.total_hints_used || 0,
      effective_time_seconds: currentActiveTime + (session.total_penalty_seconds || 0),
      questions: questions.map(q => {
        // Normalize status: DB uses uppercase, frontend expects lowercase
        // DB 'IN_PROGRESS' → frontend 'active'
        let normalizedStatus = (q.status || 'not_started').toLowerCase();
        if (normalizedStatus === 'in_progress') normalizedStatus = 'active';

        return {
          puzzle_id: q.puzzle_id,
          title: q.title,
          level: q.level,
          puzzle_number: q.puzzle_number,
          status: normalizedStatus,
          time_spent_seconds: (q.time_spent_seconds || 0) +
            ((normalizedStatus === 'active') && q.started_at ? Math.floor((now - new Date(q.started_at)) / 1000) : 0),
          skip_count: q.skip_count || 0,
          time_penalty_seconds: q.time_penalty_seconds || 0
        };
      })
    };
  } catch (error) {
    // If tables don't exist, return empty session state
    if (isTableNotFoundError(error)) {
      console.log('Time tracking tables not found, returning empty session');
      return {
        session_id: null,
        status: 'not_started',
        session_start: null,
        session_end: null,
        total_time_seconds: 0,
        active_time_seconds: 0,
        questions_completed: 0,
        questions_skipped: 0,
        total_penalty_seconds: 0,
        total_hints_used: 0,
        effective_time_seconds: 0,
        questions: []
      };
    }
    throw error;
  }
}

/**
 * RECALCULATE TEAM EFFECTIVE TIME
 * Updates team's effective time based on all penalties
 */
async function recalculateTeamEffectiveTime(teamId) {
  try {
    // Get total time from all questions
    const [totalTime] = await db.query(
      `SELECT SUM(time_spent_seconds) as total FROM team_question_progress WHERE team_id = ?`,
      [teamId]
    );
    
    // Get hint penalties (non-critical if table doesn't exist)
    let hintPenaltyTime = 0;
    try {
      const [hintPenalty] = await db.query(
        `SELECT SUM(time_penalty_applied) as total FROM hint_usage WHERE team_id = ?`,
        [teamId]
      );
      hintPenaltyTime = hintPenalty[0]?.total || 0;
    } catch (err) {
      console.log('hint_usage table not available');
    }
    
    const activeTime = totalTime[0]?.total || 0;
    const effectiveTime = activeTime + hintPenaltyTime;
    
    // Update session (non-critical - table may not exist)
    try {
      await db.query(
        `UPDATE team_sessions SET total_time_seconds = ?, updated_at = ? WHERE team_id = ?`,
        [activeTime, new Date(), teamId]
      );
    } catch (err) {
      console.log('Error updating session:', err.message);
    }
    
    return { activeTime, hintPenaltyTime, effectiveTime };
  } catch (error) {
    console.log('Error recalculating time:', error.message);
    return { activeTime: 0, hintPenaltyTime: 0, effectiveTime: 0 };
  }
}

/**
 * ADMIN: GET ALL TEAM TIMINGS
 * Returns comprehensive timing data for all teams
 * Rewritten to use Supabase-compatible queries (separate simpler queries)
 */
async function getAdminTeamTimings() {
  try {
    // Use Supabase-compatible separate queries instead of complex MySQL subqueries
    const { supabaseAdmin } = require('../config/supabase');
    const USE_SUPABASE = process.env.USE_SUPABASE === 'true';
    
    if (USE_SUPABASE) {
      // Supabase approach - separate simple queries
      const { data: teams, error: teamsError } = await supabaseAdmin
        .from('teams')
        .select('id, team_name, status, start_time, end_time, hints_used')
        .order('created_at', { ascending: false });
      
      if (teamsError) throw teamsError;
      if (!teams || teams.length === 0) return { teams: [] };
      
      // Get puzzle count
      const { data: puzzles } = await supabaseAdmin
        .from('puzzles')
        .select('id')
        .eq('is_active', true)
        .eq('level', 1);
      const totalQuestions = puzzles?.length || 10;
      
      // Build team info with JS calculations
      const teamsWithDetails = teams.map(team => {
        // Calculate time in JavaScript
        let totalTimeSeconds = 0;
        if (team.start_time && team.end_time) {
          totalTimeSeconds = Math.floor((new Date(team.end_time) - new Date(team.start_time)) / 1000);
        } else if (team.start_time && team.status === 'active') {
          totalTimeSeconds = Math.floor((new Date() - new Date(team.start_time)) / 1000);
        }
        
        return {
          teamId: team.id,
          teamName: team.team_name,
          currentStatus: team.status || 'waiting',
          totalTime: totalTimeSeconds,
          penaltyTime: 0,
          questionsCompleted: 0,
          totalQuestions: totalQuestions,
          currentQuestion: 1,
          skipsUsed: 0,
          hintsUsed: team.hints_used || 0,
          correctAnswers: 0,
          wrongAnswers: 0,
          questionTimes: []
        };
      });
      
      return { teams: teamsWithDetails };
    }
    
    // MySQL approach - original complex query
    const [teams] = await db.query(`
      SELECT 
        t.id,
        t.team_name as teamName,
        t.status,
        t.start_time,
        t.end_time,
        t.hints_used
      FROM teams t
      ORDER BY t.created_at DESC
    `);
    
    // Build team details with JS calculations
    const teamsWithDetails = teams.map(team => {
      let totalTimeSeconds = 0;
      if (team.start_time && team.end_time) {
        totalTimeSeconds = Math.floor((new Date(team.end_time) - new Date(team.start_time)) / 1000);
      } else if (team.start_time && team.status === 'active') {
        totalTimeSeconds = Math.floor((new Date() - new Date(team.start_time)) / 1000);
      }
      
      let currentStatus = 'waiting';
      if (team.status === 'completed') currentStatus = 'completed';
      else if (team.status === 'active') currentStatus = 'active';
      else if (team.status === 'paused') currentStatus = 'paused';
      else if (team.status === 'disqualified') currentStatus = 'disqualified';
      
      return {
        teamId: team.id,
        teamName: team.teamName || team.team_name,
        currentStatus,
        totalTime: totalTimeSeconds,
        penaltyTime: 0,
        questionsCompleted: 0,
        totalQuestions: 10,
        currentQuestion: 1,
        skipsUsed: 0,
        hintsUsed: team.hints_used || 0,
        correctAnswers: 0,
        wrongAnswers: 0,
        questionTimes: []
      };
    });
    
    return {
      teams: teamsWithDetails
    };
  } catch (error) {
    console.error('Error in getAdminTeamTimings:', error);
    // Return empty on error (tables might not exist)
    return { teams: [] };
  }
}

/**
 * ADMIN: GET GAME SETTINGS
 */
async function getGameSettings() {
  const defaultSettings = {
    skipEnabled: true,
    maxSkipsPerTeam: 3,
    skipPenaltySeconds: 60,
    hintPenaltySeconds: 30,
    maxHintsPerQuestion: 2,
    questionTimeLimitSeconds: 1800,
    totalGameTimeLimitSeconds: 7200,
    rankBy: 'completion_time'
  };
  
  try {
    const [settings] = await db.query('SELECT * FROM game_settings WHERE id = 1');
    
    if (!settings || settings.length === 0) {
      // Return defaults if no settings exist
      return defaultSettings;
    }
    
    const s = settings[0];
    return {
      skipEnabled: s.skip_enabled === 1 || s.skip_enabled === true,
      maxSkipsPerTeam: s.max_skips_per_team || 3,
      skipPenaltySeconds: s.skip_penalty_seconds || 60,
      hintPenaltySeconds: s.hint_penalty_seconds || 30,
      maxHintsPerQuestion: s.max_hints_per_question || 2,
      questionTimeLimitSeconds: s.question_time_limit_seconds || 1800,
      totalGameTimeLimitSeconds: s.total_game_time_limit_seconds || 7200,
      rankBy: s.rank_by || 'completion_time'
    };
  } catch (error) {
    // If table doesn't exist, return defaults
    if (isTableNotFoundError(error)) {
      console.log('game_settings table not found, returning defaults');
      return defaultSettings;
    }
    console.error('Error fetching game settings:', error);
    return defaultSettings; // Return defaults on any error to keep UI working
  }
}

// Map of frontend keys to database column names
const SETTING_KEY_MAP = {
  skipEnabled: 'skip_enabled',
  maxSkipsPerTeam: 'max_skips_per_team',
  skipPenaltySeconds: 'skip_penalty_seconds',
  hintPenaltySeconds: 'hint_penalty_seconds',
  maxHintsPerQuestion: 'max_hints_per_question',
  questionTimeLimitSeconds: 'question_time_limit_seconds',
  totalGameTimeLimitSeconds: 'total_game_time_limit_seconds',
  rankBy: 'rank_by'
};

/**
 * ADMIN: UPDATE GAME SETTING
 */
async function updateGameSetting(key, value, adminId) {
  const columnName = SETTING_KEY_MAP[key];
  
  if (!columnName) {
    throw new Error(`Unknown setting key: ${key}`);
  }
  
  try {
    // Check if settings row exists
    const [existing] = await db.query('SELECT id FROM game_settings WHERE id = 1');
    
    if (existing.length === 0) {
      // Insert default row first
      await db.query(
        `INSERT INTO game_settings (id, ${columnName}, updated_by, updated_at) 
         VALUES (1, ?, ?, NOW())`,
        [value, adminId]
      );
    } else {
      // Update existing row
      await db.query(
        `UPDATE game_settings 
         SET ${columnName} = ?, updated_by = ?, updated_at = NOW()
         WHERE id = 1`,
        [value, adminId]
      );
    }
    
    return { success: true, key, value };
  } catch (error) {
    if (isTableNotFoundError(error)) {
      console.log('game_settings table not found, cannot update settings');
      return { success: false, key, value, error: 'Settings table not found' };
    }
    throw error;
  }
}

/**
 * SYNC TIMER (for reconnection/refresh)
 * Returns the authoritative server time for a team's session
 */
async function syncTimer(teamId, puzzleId) {
  const state = await getTimerState(teamId, puzzleId);
  const session = await getSessionState(teamId);
  
  // Log sync event
  await logTimeEvent(teamId, puzzleId, 'timer_sync',
    state.time_spent_seconds, state.time_spent_seconds, {});
  
  return {
    question: state,
    session: session,
    server_time: new Date().toISOString()
  };
}

/**
 * GET QUESTION ANALYTICS (Admin)
 * Shows aggregate stats per question for admin dashboard
 * Rewritten for Supabase compatibility using simple queries
 */
async function getQuestionAnalytics() {
  try {
    const USE_SUPABASE = process.env.USE_SUPABASE === 'true';
    
    if (USE_SUPABASE) {
      const { supabaseAdmin } = require('../config/supabase');
      
      // Get all puzzles
      const { data: puzzles, error: puzzlesError } = await supabaseAdmin
        .from('puzzles')
        .select('id, title, level, puzzle_number')
        .order('level')
        .order('puzzle_number');
      
      if (puzzlesError) throw puzzlesError;
      
      // Return simple puzzle list without complex aggregations
      return {
        questions: (puzzles || []).map(p => ({
          id: p.id,
          title: p.title,
          level: p.level,
          puzzleNumber: p.puzzle_number,
          totalAttempts: 0,
          completedCount: 0,
          skippedCount: 0,
          avgTime: 0,
          minTime: 0,
          maxTime: 0,
          totalHintsUsed: 0
        })),
        overallAvgTime: 600
      };
    }
    
    // MySQL approach - original query with LEFT JOIN
    const [questions] = await db.query(`
      SELECT 
        p.id,
        p.title,
        p.level,
        p.puzzle_number
      FROM puzzles p
      ORDER BY p.level, p.puzzle_number
    `);

    return {
      questions: questions.map(q => ({
        id: q.id,
        title: q.title,
        level: q.level,
        puzzleNumber: q.puzzle_number,
        totalAttempts: 0,
        completedCount: 0,
        skippedCount: 0,
        avgTime: 0,
        minTime: 0,
        maxTime: 0,
        totalHintsUsed: 0
      })),
      overallAvgTime: 600
    };
  } catch (error) {
    console.error('Error getting question analytics:', error);
    // Return empty analytics on error (tables might not exist yet)
    return {
      questions: [],
      overallAvgTime: 600
    };
  }
}

/**
 * GO TO QUESTION
 * Navigate to any previously visited question (completed, skipped, or active)
 */
async function goToQuestion(teamId, puzzleId, req = null) {
  try {
    // Verify puzzle exists
    const [puzzle] = await db.query(
      'SELECT id, level, puzzle_number, title FROM puzzles WHERE id = ? AND is_active = true',
      [puzzleId]
    );
    
    if (puzzle.length === 0) {
      throw new Error('Puzzle not found or inactive');
    }
    
    const now = new Date();
    
    // Clear any existing IN_PROGRESS status for OTHER puzzles on this team
    // This ensures only one puzzle is IN_PROGRESS at a time
    try {
      await db.query(
        `UPDATE team_question_progress SET status = 'NOT_STARTED', updated_at = ? WHERE team_id = ? AND status = 'IN_PROGRESS' AND puzzle_id != ?`,
        [now, teamId, puzzleId]
      );
    } catch (e) {
      console.log('Error clearing old IN_PROGRESS:', e.message);
    }
    
    // Check if progress exists for target puzzle
    const [progressRows] = await db.query(
      'SELECT * FROM team_question_progress WHERE team_id = ? AND puzzle_id = ?',
      [teamId, puzzleId]
    );
    
    if (progressRows.length === 0) {
      // Create new record with IN_PROGRESS
      const progressId = uuidv4();
      await db.query(
        `INSERT INTO team_question_progress (id, team_id, puzzle_id, status, started_at, time_spent_seconds)
         VALUES (?, ?, ?, 'IN_PROGRESS', ?, 0)`,
        [progressId, teamId, puzzleId, now]
      );
    } else {
      const progress = progressRows[0];
      const statusUpper = (progress.status || '').toUpperCase();
      
      // Mark as IN_PROGRESS unless it's COMPLETED
      if (statusUpper !== 'COMPLETED') {
        await db.query(
          `UPDATE team_question_progress 
           SET status = 'IN_PROGRESS', started_at = ?, updated_at = ?
           WHERE team_id = ? AND puzzle_id = ?`,
          [now, now, teamId, puzzleId]
        );
      }
    }
    
    return {
      success: true,
      message: 'Navigated to question',
      puzzle_id: puzzleId,
      puzzle_title: puzzle[0].title
    };
  } catch (error) {
    console.error('Go to question error:', error);
    throw error;
  }
}

module.exports = {
  // Question operations
  startQuestion,
  pauseQuestion,
  resumeQuestion,
  completeQuestion,
  skipQuestion,
  unskipQuestion,
  goToQuestion,
  
  // Session operations
  endSession,
  getOrCreateTeamSession,
  
  // Timer state
  getTimerState,
  getSessionState,
  syncTimer,
  
  // Calculations
  recalculateTeamEffectiveTime,
  
  // Admin operations
  getAdminTeamTimings,
  getQuestionAnalytics,
  getGameSettings,
  updateGameSetting,
  
  // Helpers
  logTimeEvent
};
