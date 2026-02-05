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
 * Initialize or get team session
 * Creates a session record if one doesn't exist
 */
async function getOrCreateTeamSession(teamId) {
  const [existing] = await db.query(
    'SELECT * FROM team_sessions WHERE team_id = ?',
    [teamId]
  );
  
  if (existing.length > 0) {
    return existing[0];
  }
  
  // Create new session
  const sessionId = uuidv4();
  await db.query(
    `INSERT INTO team_sessions (id, team_id, status) VALUES (?, ?, 'not_started')`,
    [sessionId, teamId]
  );
  
  const [newSession] = await db.query(
    'SELECT * FROM team_sessions WHERE id = ?',
    [sessionId]
  );
  return newSession[0];
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
     VALUES (?, ?, ?, 'not_started')`,
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
    
    // Validate state transition
    if (progress.status === 'completed') {
      throw new Error('Question already completed');
    }
    
    if (progress.status === 'active') {
      throw new Error('Question already in progress');
    }
    
    const now = new Date();
    const timeBefore = progress.time_spent_seconds;
    
    // Update question progress
    await connection.query(
      `UPDATE team_question_progress 
       SET status = 'active',
           started_at = ?,
           first_started_at = COALESCE(first_started_at, ?),
           last_resumed_at = ?,
           updated_at = ?
       WHERE team_id = ? AND puzzle_id = ?`,
      [now, now, now, now, teamId, puzzleId]
    );
    
    // Update team's current puzzle
    await connection.query(
      `UPDATE teams SET current_puzzle_id = ?, is_paused = FALSE WHERE id = ?`,
      [puzzleId, teamId]
    );
    
    // Ensure session is active
    await connection.query(
      `UPDATE team_sessions 
       SET status = 'active',
           session_start = COALESCE(session_start, ?),
           last_activity_at = ?
       WHERE team_id = ?`,
      [now, now, teamId]
    );
    
    await connection.commit();
    
    // Log event
    await logTimeEvent(teamId, puzzleId, 'question_start', timeBefore, timeBefore, {
      resumed_from_skip: progress.status === 'skipped'
    }, req);
    
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
    
    // Validate state
    if (progress.status !== 'active') {
      throw new Error(`Cannot pause question in '${progress.status}' state`);
    }
    
    if (!progress.started_at) {
      throw new Error('Question timer not started');
    }
    
    const now = new Date();
    const startedAt = new Date(progress.started_at);
    const elapsedSeconds = Math.floor((now - startedAt) / 1000);
    const newTotalTime = progress.time_spent_seconds + elapsedSeconds;
    
    // Update progress
    await connection.query(
      `UPDATE team_question_progress 
       SET status = 'paused',
           started_at = NULL,
           time_spent_seconds = ?,
           last_paused_at = ?,
           updated_at = ?
       WHERE team_id = ? AND puzzle_id = ?`,
      [newTotalTime, now, now, teamId, puzzleId]
    );
    
    // Update team state
    await connection.query(
      `UPDATE teams SET is_paused = TRUE, paused_at = ? WHERE id = ?`,
      [now, teamId]
    );
    
    // Update session
    await connection.query(
      `UPDATE team_sessions 
       SET status = 'paused',
           pause_count = pause_count + 1,
           last_activity_at = ?
       WHERE team_id = ?`,
      [now, teamId]
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
    
    // Update progress
    await connection.query(
      `UPDATE team_question_progress 
       SET status = 'active',
           started_at = ?,
           last_resumed_at = ?,
           updated_at = ?
       WHERE team_id = ? AND puzzle_id = ?`,
      [now, now, now, teamId, puzzleId]
    );
    
    // Update team state
    await connection.query(
      `UPDATE teams 
       SET is_paused = FALSE, 
           current_puzzle_id = ?,
           total_pause_duration_seconds = total_pause_duration_seconds + ?
       WHERE id = ?`,
      [puzzleId, pauseDuration, teamId]
    );
    
    // Update session
    await connection.query(
      `UPDATE team_sessions 
       SET status = 'active',
           total_pause_time_seconds = total_pause_time_seconds + ?,
           last_activity_at = ?
       WHERE team_id = ?`,
      [pauseDuration, now, teamId]
    );
    
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
    
    // Validate state
    if (progress.status === 'completed') {
      throw new Error('Question already completed');
    }
    
    const now = new Date();
    let finalTime = progress.time_spent_seconds;
    
    // If question was active, add remaining time
    if (progress.status === 'active' && progress.started_at) {
      const startedAt = new Date(progress.started_at);
      const elapsedSeconds = Math.floor((now - startedAt) / 1000);
      finalTime += elapsedSeconds;
    }
    
    // Update progress
    await connection.query(
      `UPDATE team_question_progress 
       SET status = 'completed',
           started_at = NULL,
           ended_at = ?,
           time_spent_seconds = ?,
           updated_at = ?
       WHERE team_id = ? AND puzzle_id = ?`,
      [now, finalTime, now, teamId, puzzleId]
    );
    
    // Update team session
    await connection.query(
      `UPDATE team_sessions 
       SET questions_completed = questions_completed + 1,
           active_time_seconds = active_time_seconds + ?,
           last_activity_at = ?
       WHERE team_id = ?`,
      [finalTime, now, teamId]
    );
    
    // Clear current puzzle from team
    await connection.query(
      `UPDATE teams SET current_puzzle_id = NULL WHERE id = ?`,
      [teamId]
    );
    
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
  const connection = await db.getConnection();
  
  try {
    await connection.beginTransaction();
    
    // Check if skipping is enabled
    const [settings] = await connection.query(
      `SELECT setting_value FROM game_settings WHERE setting_key = 'skip_enabled'`
    );
    
    if (settings.length > 0 && settings[0].setting_value === 'false') {
      throw new Error('Skipping is currently disabled');
    }
    
    // Check max skips
    const [maxSkipsRow] = await connection.query(
      `SELECT setting_value FROM game_settings WHERE setting_key = 'max_skips_per_team'`
    );
    const maxSkips = maxSkipsRow.length > 0 ? parseInt(maxSkipsRow[0].setting_value) : 3;
    
    // Count team's current skips
    const [skipCount] = await connection.query(
      `SELECT questions_skipped FROM team_sessions WHERE team_id = ?`,
      [teamId]
    );
    
    if (skipCount.length > 0 && skipCount[0].questions_skipped >= maxSkips) {
      throw new Error(`Maximum skips (${maxSkips}) reached`);
    }
    
    // Get skip penalty
    const [penaltyRow] = await connection.query(
      `SELECT setting_value FROM game_settings WHERE setting_key = 'skip_penalty_seconds'`
    );
    const skipPenalty = penaltyRow.length > 0 ? parseInt(penaltyRow[0].setting_value) : 300;
    
    // Get current progress
    const [progressRows] = await connection.query(
      'SELECT * FROM team_question_progress WHERE team_id = ? AND puzzle_id = ?',
      [teamId, puzzleId]
    );
    
    let progress = progressRows[0];
    if (!progress) {
      // Create progress if doesn't exist
      const progressId = uuidv4();
      await connection.query(
        `INSERT INTO team_question_progress (id, team_id, puzzle_id, status) VALUES (?, ?, ?, 'not_started')`,
        [progressId, teamId, puzzleId]
      );
      const [newProgress] = await connection.query(
        'SELECT * FROM team_question_progress WHERE id = ?',
        [progressId]
      );
      progress = newProgress[0];
    }
    
    // Validate state
    if (progress.status === 'completed') {
      throw new Error('Cannot skip completed question');
    }
    
    const now = new Date();
    let timeSpent = progress.time_spent_seconds;
    
    // If active, calculate elapsed time
    if (progress.status === 'active' && progress.started_at) {
      const startedAt = new Date(progress.started_at);
      const elapsedSeconds = Math.floor((now - startedAt) / 1000);
      timeSpent += elapsedSeconds;
    }
    
    const newSkipCount = progress.skip_count + 1;
    const totalSkipPenalty = progress.skip_penalty_seconds + skipPenalty;
    
    // Update progress
    await connection.query(
      `UPDATE team_question_progress 
       SET status = 'skipped',
           started_at = NULL,
           time_spent_seconds = ?,
           skip_count = ?,
           skip_penalty_seconds = ?,
           updated_at = ?
       WHERE team_id = ? AND puzzle_id = ?`,
      [timeSpent, newSkipCount, totalSkipPenalty, now, teamId, puzzleId]
    );
    
    // Update session
    await connection.query(
      `UPDATE team_sessions 
       SET questions_skipped = questions_skipped + 1,
           total_skip_penalty_seconds = total_skip_penalty_seconds + ?,
           last_activity_at = ?
       WHERE team_id = ?`,
      [skipPenalty, now, teamId]
    );
    
    // Clear current puzzle
    await connection.query(
      `UPDATE teams SET current_puzzle_id = NULL, is_paused = FALSE WHERE id = ?`,
      [teamId]
    );
    
    await connection.commit();
    
    // Log event
    await logTimeEvent(teamId, puzzleId, 'question_skip',
      progress.time_spent_seconds, timeSpent, 
      { skip_count: newSkipCount, penalty_applied: skipPenalty }, req);
    
    // Recalculate effective time
    await recalculateTeamEffectiveTime(teamId);
    
    return {
      success: true,
      message: 'Question skipped',
      time_spent_seconds: timeSpent,
      skip_penalty_seconds: skipPenalty,
      total_skips: skipCount.length > 0 ? skipCount[0].questions_skipped + 1 : 1,
      max_skips: maxSkips
    };
    
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

/**
 * UNSKIP QUESTION (Return to skipped question)
 * Called when team returns to a previously skipped question
 */
async function unskipQuestion(teamId, puzzleId, req = null) {
  const connection = await db.getConnection();
  
  try {
    await connection.beginTransaction();
    
    // Check if returning to skipped questions is allowed
    const [settings] = await connection.query(
      `SELECT setting_value FROM game_settings WHERE setting_key = 'allow_skip_return'`
    );
    
    if (settings.length > 0 && settings[0].setting_value === 'false') {
      throw new Error('Returning to skipped questions is disabled');
    }
    
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
    if (progress.status !== 'skipped') {
      throw new Error('Question is not in skipped state');
    }
    
    const now = new Date();
    
    // Resume the question (make it active again)
    await connection.query(
      `UPDATE team_question_progress 
       SET status = 'active',
           started_at = ?,
           last_resumed_at = ?,
           updated_at = ?
       WHERE team_id = ? AND puzzle_id = ?`,
      [now, now, now, teamId, puzzleId]
    );
    
    // Update team state
    await connection.query(
      `UPDATE teams SET current_puzzle_id = ?, is_paused = FALSE WHERE id = ?`,
      [puzzleId, teamId]
    );
    
    // Update session
    await connection.query(
      `UPDATE team_sessions 
       SET status = 'active',
           last_activity_at = ?
       WHERE team_id = ?`,
      [now, teamId]
    );
    
    await connection.commit();
    
    // Log event
    await logTimeEvent(teamId, puzzleId, 'question_unskip',
      progress.time_spent_seconds, progress.time_spent_seconds, {}, req);
    
    return {
      success: true,
      message: 'Returned to skipped question',
      time_spent_seconds: progress.time_spent_seconds,
      skip_penalty_already_applied: progress.skip_penalty_seconds
    };
    
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
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
      `SELECT puzzle_id FROM team_question_progress 
       WHERE team_id = ? AND status = 'active'`,
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
          `UPDATE team_question_progress 
           SET status = 'paused',
               started_at = NULL,
               time_spent_seconds = ?,
               updated_at = ?
           WHERE team_id = ? AND puzzle_id = ?`,
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
    
    // Update session
    await connection.query(
      `UPDATE team_sessions 
       SET status = 'completed',
           session_end = ?,
           total_time_seconds = ?,
           active_time_seconds = ?,
           updated_at = ?
       WHERE team_id = ?`,
      [now, totalTime[0]?.total || 0, totalTime[0]?.total || 0, now, teamId]
    );
    
    // Update team
    await connection.query(
      `UPDATE teams 
       SET status = 'completed',
           end_time = ?,
           is_paused = FALSE,
           current_puzzle_id = NULL
       WHERE id = ?`,
      [now, teamId]
    );
    
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
  
  // If active, calculate current elapsed time
  if (progress.status === 'active' && progress.started_at) {
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
    skip_count: progress.skip_count,
    skip_penalty_seconds: progress.skip_penalty_seconds,
    started_at: progress.started_at,
    first_started_at: progress.first_started_at
  };
}

/**
 * GET TEAM SESSION STATE
 * Returns the complete session state for a team
 */
async function getSessionState(teamId) {
  const session = await getOrCreateTeamSession(teamId);
  
  // Get all question progress
  const [questions] = await db.query(
    `SELECT tqp.*, p.title, p.puzzle_number, p.level
     FROM team_question_progress tqp
     JOIN puzzles p ON tqp.puzzle_id = p.id
     WHERE tqp.team_id = ?
     ORDER BY p.level, p.puzzle_number`,
    [teamId]
  );
  
  // Calculate current active time if any question is running
  let currentActiveTime = 0;
  const now = new Date();
  
  for (const q of questions) {
    if (q.status === 'active' && q.started_at) {
      const startedAt = new Date(q.started_at);
      currentActiveTime += Math.floor((now - startedAt) / 1000);
    }
    currentActiveTime += q.time_spent_seconds;
  }
  
  return {
    session_id: session.id,
    status: session.status,
    session_start: session.session_start,
    session_end: session.session_end,
    total_time_seconds: session.total_time_seconds,
    active_time_seconds: currentActiveTime,
    questions_completed: session.questions_completed,
    questions_skipped: session.questions_skipped,
    total_skip_penalty_seconds: session.total_skip_penalty_seconds,
    total_hint_penalty_seconds: session.total_hint_penalty_seconds,
    effective_time_seconds: currentActiveTime + session.total_skip_penalty_seconds + session.total_hint_penalty_seconds,
    questions: questions.map(q => ({
      puzzle_id: q.puzzle_id,
      title: q.title,
      level: q.level,
      puzzle_number: q.puzzle_number,
      status: q.status,
      time_spent_seconds: q.time_spent_seconds + 
        (q.status === 'active' && q.started_at ? Math.floor((now - new Date(q.started_at)) / 1000) : 0),
      skip_count: q.skip_count,
      skip_penalty_seconds: q.skip_penalty_seconds
    }))
  };
}

/**
 * RECALCULATE TEAM EFFECTIVE TIME
 * Updates team's effective time based on all penalties
 */
async function recalculateTeamEffectiveTime(teamId) {
  // Get total time from all questions
  const [totalTime] = await db.query(
    `SELECT SUM(time_spent_seconds) as total FROM team_question_progress WHERE team_id = ?`,
    [teamId]
  );
  
  // Get skip penalties
  const [skipPenalty] = await db.query(
    `SELECT SUM(skip_penalty_seconds) as total FROM team_question_progress WHERE team_id = ?`,
    [teamId]
  );
  
  // Get hint penalties
  const [hintPenalty] = await db.query(
    `SELECT SUM(time_penalty_applied) as total FROM hint_usage WHERE team_id = ?`,
    [teamId]
  );
  
  const activeTime = totalTime[0]?.total || 0;
  const skipPenaltyTime = skipPenalty[0]?.total || 0;
  const hintPenaltyTime = hintPenalty[0]?.total || 0;
  const effectiveTime = activeTime + skipPenaltyTime + hintPenaltyTime;
  
  // Update session
  await db.query(
    `UPDATE team_sessions 
     SET active_time_seconds = ?,
         total_skip_penalty_seconds = ?,
         total_hint_penalty_seconds = ?
     WHERE team_id = ?`,
    [activeTime, skipPenaltyTime, hintPenaltyTime, teamId]
  );
  
  // Update team
  await db.query(
    `UPDATE teams SET effective_time_seconds = ? WHERE id = ?`,
    [effectiveTime, teamId]
  );
  
  return { activeTime, skipPenaltyTime, hintPenaltyTime, effectiveTime };
}

/**
 * ADMIN: GET ALL TEAM TIMINGS
 * Returns comprehensive timing data for all teams
 */
async function getAdminTeamTimings() {
  const [teams] = await db.query(`
    SELECT 
      t.id,
      t.team_name,
      t.status,
      t.start_time,
      t.end_time,
      t.effective_time_seconds,
      ts.active_time_seconds,
      ts.total_skip_penalty_seconds,
      ts.total_hint_penalty_seconds,
      ts.questions_completed,
      ts.questions_skipped,
      ts.session_start,
      ts.session_end,
      (SELECT COUNT(*) FROM puzzles WHERE is_active = true) as total_puzzles
    FROM teams t
    LEFT JOIN team_sessions ts ON t.id = ts.team_id
    WHERE t.status IN ('active', 'completed', 'paused')
    ORDER BY ts.questions_completed DESC, t.effective_time_seconds ASC
  `);
  
  // Get per-question timing for each team
  const [questionTimes] = await db.query(`
    SELECT 
      tqp.team_id,
      tqp.puzzle_id,
      p.title,
      p.level,
      p.puzzle_number,
      tqp.status,
      tqp.time_spent_seconds,
      tqp.skip_count,
      tqp.skip_penalty_seconds,
      tqp.first_started_at,
      tqp.ended_at
    FROM team_question_progress tqp
    JOIN puzzles p ON tqp.puzzle_id = p.id
    ORDER BY tqp.team_id, p.level, p.puzzle_number
  `);
  
  // Group question times by team
  const questionTimesByTeam = {};
  for (const qt of questionTimes) {
    if (!questionTimesByTeam[qt.team_id]) {
      questionTimesByTeam[qt.team_id] = [];
    }
    questionTimesByTeam[qt.team_id].push(qt);
  }
  
  // Calculate statistics
  const completedTeams = teams.filter(t => t.status === 'completed');
  const avgSolveTime = completedTeams.length > 0 
    ? completedTeams.reduce((sum, t) => sum + (t.effective_time_seconds || 0), 0) / completedTeams.length 
    : 0;
  
  const fastestTeam = completedTeams.length > 0 
    ? completedTeams.reduce((min, t) => (!min || t.effective_time_seconds < min.effective_time_seconds) ? t : min, null)
    : null;
  
  const slowestTeam = completedTeams.length > 0 
    ? completedTeams.reduce((max, t) => (!max || t.effective_time_seconds > max.effective_time_seconds) ? t : max, null)
    : null;
  
  return {
    teams: teams.map(team => ({
      ...team,
      question_times: questionTimesByTeam[team.id] || []
    })),
    statistics: {
      total_teams: teams.length,
      active_teams: teams.filter(t => t.status === 'active').length,
      completed_teams: completedTeams.length,
      average_solve_time_seconds: Math.round(avgSolveTime),
      fastest_team: fastestTeam ? {
        id: fastestTeam.id,
        name: fastestTeam.team_name,
        time_seconds: fastestTeam.effective_time_seconds
      } : null,
      slowest_team: slowestTeam ? {
        id: slowestTeam.id,
        name: slowestTeam.team_name,
        time_seconds: slowestTeam.effective_time_seconds
      } : null
    }
  };
}

/**
 * ADMIN: GET GAME SETTINGS
 */
async function getGameSettings() {
  const [settings] = await db.query('SELECT * FROM game_settings');
  
  const settingsMap = {};
  for (const s of settings) {
    let value = s.setting_value;
    if (s.setting_type === 'boolean') value = value === 'true';
    else if (s.setting_type === 'integer') value = parseInt(value);
    else if (s.setting_type === 'json') value = JSON.parse(value);
    settingsMap[s.setting_key] = value;
  }
  
  return settingsMap;
}

/**
 * ADMIN: UPDATE GAME SETTING
 */
async function updateGameSetting(key, value, adminId) {
  await db.query(
    `UPDATE game_settings 
     SET setting_value = ?, updated_by = ?, updated_at = NOW()
     WHERE setting_key = ?`,
    [String(value), adminId, key]
  );
  
  return { success: true, key, value };
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

module.exports = {
  // Question operations
  startQuestion,
  pauseQuestion,
  resumeQuestion,
  completeQuestion,
  skipQuestion,
  unskipQuestion,
  
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
  getGameSettings,
  updateGameSetting,
  
  // Helpers
  logTimeEvent
};
