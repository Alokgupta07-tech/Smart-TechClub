/**
 * ==============================================
 * QUALIFICATION SERVICE
 * ==============================================
 * Handles all level qualification logic:
 * - Level completion detection
 * - Auto-qualification based on cutoffs
 * - Message generation
 * - Admin overrides
 * - Audit logging
 * 
 * NEW CODE - Added for Level-Wise Qualification System
 * Updated with Supabase support
 */

const db = require('../config/db');
const { v4: uuidv4 } = require('uuid');
const { supabaseAdmin } = require('../config/supabase');
const USE_SUPABASE = process.env.USE_SUPABASE === 'true';

/**
 * Initialize team level status when team starts a level
 * @param {string} teamId - Team's UUID
 * @param {number} levelId - Level number
 */
async function initializeLevelStatus(teamId, levelId) {
  try {
    const id = uuidv4();

    if (USE_SUPABASE) {
      try {
        // Check if already exists
        const { data: existing, error: selectErr } = await supabaseAdmin
          .from('team_level_status')
          .select('id, status')
          .eq('team_id', teamId)
          .eq('level_id', levelId);

        if (selectErr) throw selectErr;

        if (existing && existing.length > 0) {
          // Update to IN_PROGRESS if not started
          if (existing[0].status === 'NOT_STARTED') {
            const { error: updateErr } = await supabaseAdmin
              .from('team_level_status')
              .update({
                status: 'IN_PROGRESS',
                started_at: new Date().toISOString(),
                updated_at: new Date().toISOString()
              })
              .eq('team_id', teamId)
              .eq('level_id', levelId);
            if (updateErr) throw updateErr;
          }
          return existing[0].id;
        }

        // Create new status record
        const { error: insertErr } = await supabaseAdmin
          .from('team_level_status')
          .insert({
            id,
            team_id: teamId,
            level_id: levelId,
            status: 'IN_PROGRESS',
            qualification_status: 'PENDING',
            started_at: new Date().toISOString()
          });

        if (insertErr) throw insertErr;

        // Log the event
        await logQualificationEvent(teamId, levelId, 'LEVEL_STARTED', null, 'IN_PROGRESS');

        return id;
      } catch (supaError) {
        console.error('Supabase error in initializeLevelStatus, falling back to MySQL:', supaError);
      }
    }

    // MySQL fallback
    // Check if already exists
    const [existing] = await db.query(
      'SELECT id FROM team_level_status WHERE team_id = ? AND level_id = ?',
      [teamId, levelId]
    );

    if (existing.length > 0) {
      // Update to IN_PROGRESS if not started
      await db.query(
        `UPDATE team_level_status 
         SET status = CASE WHEN status = 'NOT_STARTED' THEN 'IN_PROGRESS' ELSE status END,
             started_at = COALESCE(started_at, NOW()),
             updated_at = NOW()
         WHERE team_id = ? AND level_id = ?`,
        [teamId, levelId]
      );
      return existing[0].id;
    }

    // Create new status record
    await db.query(
      `INSERT INTO team_level_status 
       (id, team_id, level_id, status, qualification_status, started_at)
       VALUES (?, ?, ?, 'IN_PROGRESS', 'PENDING', NOW())`,
      [id, teamId, levelId]
    );

    // Log the event
    await logQualificationEvent(teamId, levelId, 'LEVEL_STARTED', null, 'IN_PROGRESS');

    return id;
  } catch (error) {
    console.error('Error initializing level status:', error);
    throw error;
  }
}

/**
 * Update team's level progress (called after each question)
 * @param {string} teamId - Team's UUID
 * @param {number} levelId - Level number
 * @param {Object} progressData - Progress metrics
 */
async function updateLevelProgress(teamId, levelId, progressData) {
  try {
    const { score, questionsAnswered, questionsCorrect, timeTaken, hintsUsed } = progressData;

    const accuracy = questionsAnswered > 0 
      ? ((questionsCorrect / questionsAnswered) * 100).toFixed(2) 
      : 0;

    if (USE_SUPABASE) {
      try {
        const { error } = await supabaseAdmin
          .from('team_level_status')
          .update({
            score,
            questions_answered: questionsAnswered,
            questions_correct: questionsCorrect,
            accuracy,
            time_taken_seconds: timeTaken,
            hints_used: hintsUsed,
            updated_at: new Date().toISOString()
          })
          .eq('team_id', teamId)
          .eq('level_id', levelId);

        if (error) throw error;

        return { score, questionsAnswered, questionsCorrect, accuracy, timeTaken, hintsUsed };
      } catch (supaError) {
        console.error('Supabase error in updateLevelProgress, falling back to MySQL:', supaError);
      }
    }

    // MySQL fallback
    await db.query(
      `UPDATE team_level_status 
       SET score = ?,
           questions_answered = ?,
           questions_correct = ?,
           accuracy = ?,
           time_taken_seconds = ?,
           hints_used = ?,
           updated_at = NOW()
       WHERE team_id = ? AND level_id = ?`,
      [score, questionsAnswered, questionsCorrect, accuracy, timeTaken, hintsUsed, teamId, levelId]
    );

    return { score, questionsAnswered, questionsCorrect, accuracy, timeTaken, hintsUsed };
  } catch (error) {
    console.error('Error updating level progress:', error);
    throw error;
  }
}

/**
 * Mark level as completed and run auto-qualification
 * This is called when team finishes all questions in a level
 * @param {string} teamId - Team's UUID
 * @param {number} levelId - Level number
 * @returns {Object} Qualification result
 */
async function completeLevelAndQualify(teamId, levelId) {
  try {
    let levelStatus = null;

    if (USE_SUPABASE) {
      try {
        const { data: status, error } = await supabaseAdmin
          .from('team_level_status')
          .select('*')
          .eq('team_id', teamId)
          .eq('level_id', levelId);

        if (error) throw error;

        if (!status || status.length === 0) {
          throw new Error('Level status not found');
        }

        levelStatus = status[0];

        // Already completed - don't process again
        if (levelStatus.status === 'COMPLETED') {
          return {
            success: true,
            already_completed: true,
            qualification_status: levelStatus.qualification_status
          };
        }

        // Calculate final metrics from team_progress
        const finalMetrics = await calculateFinalLevelMetrics(teamId, levelId);

        // Mark as completed
        const { error: updateErr } = await supabaseAdmin
          .from('team_level_status')
          .update({
            status: 'COMPLETED',
            completed_at: new Date().toISOString(),
            score: finalMetrics.score,
            questions_answered: finalMetrics.questionsAnswered,
            questions_correct: finalMetrics.questionsCorrect,
            accuracy: finalMetrics.accuracy,
            time_taken_seconds: finalMetrics.timeTaken,
            hints_used: finalMetrics.hintsUsed,
            updated_at: new Date().toISOString()
          })
          .eq('team_id', teamId)
          .eq('level_id', levelId);

        if (updateErr) throw updateErr;

        // Log completion
        await logQualificationEvent(teamId, levelId, 'LEVEL_COMPLETED', 'IN_PROGRESS', 'COMPLETED', null, null, finalMetrics);

        // Run auto-qualification
        const qualificationResult = await runAutoQualification(teamId, levelId, finalMetrics);

        return {
          success: true,
          metrics: finalMetrics,
          qualification: qualificationResult
        };
      } catch (supaError) {
        if (supaError.message === 'Level status not found') throw supaError;
        console.error('Supabase error in completeLevelAndQualify, falling back to MySQL:', supaError);
      }
    }

    // MySQL fallback
    // Get team's current level status
    const [status] = await db.query(
      `SELECT * FROM team_level_status WHERE team_id = ? AND level_id = ?`,
      [teamId, levelId]
    );

    if (status.length === 0) {
      throw new Error('Level status not found');
    }

    levelStatus = status[0];

    // Already completed - don't process again
    if (levelStatus.status === 'COMPLETED') {
      return {
        success: true,
        already_completed: true,
        qualification_status: levelStatus.qualification_status
      };
    }

    // Calculate final metrics from team_progress
    const finalMetrics = await calculateFinalLevelMetrics(teamId, levelId);

    // Mark as completed
    await db.query(
      `UPDATE team_level_status 
       SET status = 'COMPLETED',
           completed_at = NOW(),
           score = ?,
           questions_answered = ?,
           questions_correct = ?,
           accuracy = ?,
           time_taken_seconds = ?,
           hints_used = ?,
           updated_at = NOW()
       WHERE team_id = ? AND level_id = ?`,
      [
        finalMetrics.score,
        finalMetrics.questionsAnswered,
        finalMetrics.questionsCorrect,
        finalMetrics.accuracy,
        finalMetrics.timeTaken,
        finalMetrics.hintsUsed,
        teamId,
        levelId
      ]
    );

    // Log completion
    await logQualificationEvent(teamId, levelId, 'LEVEL_COMPLETED', 'IN_PROGRESS', 'COMPLETED', null, null, finalMetrics);

    // Run auto-qualification
    const qualificationResult = await runAutoQualification(teamId, levelId, finalMetrics);

    return {
      success: true,
      metrics: finalMetrics,
      qualification: qualificationResult
    };
  } catch (error) {
    console.error('Error completing level:', error);
    throw error;
  }
}

/**
 * Calculate final metrics for a completed level
 * @param {string} teamId - Team's UUID
 * @param {number} levelId - Level number
 */
async function calculateFinalLevelMetrics(teamId, levelId) {
  try {
    if (USE_SUPABASE) {
      try {
        // Step 1: Get puzzle IDs and points for this level
        const { data: puzzles, error: puzzleErr } = await supabaseAdmin
          .from('puzzles')
          .select('id, points')
          .eq('level', levelId);

        if (puzzleErr) throw puzzleErr;

        if (!puzzles || puzzles.length === 0) {
          return { score: 0, questionsAnswered: 0, questionsCorrect: 0, accuracy: 0, timeTaken: 0, hintsUsed: 0 };
        }

        const puzzleIds = puzzles.map(p => p.id);
        const puzzlePointsMap = {};
        for (const p of puzzles) {
          puzzlePointsMap[p.id] = p.points || 0;
        }

        // Step 2: Get team progress for those puzzles
        const { data: progress, error: progressErr } = await supabaseAdmin
          .from('team_progress')
          .select('*')
          .eq('team_id', teamId)
          .in('puzzle_id', puzzleIds);

        if (progressErr) throw progressErr;

        if (!progress || progress.length === 0) {
          return { score: 0, questionsAnswered: 0, questionsCorrect: 0, accuracy: 0, timeTaken: 0, hintsUsed: 0 };
        }

        // Step 3: Calculate metrics in JS
        const questionsAnswered = progress.length;
        const questionsCorrect = progress.filter(p => p.is_completed === true).length;
        const totalScore = progress.reduce((sum, p) => {
          return sum + (p.is_completed ? (puzzlePointsMap[p.puzzle_id] || 0) : 0);
        }, 0);
        const hintsUsed = progress.reduce((sum, p) => sum + (p.hints_used || 0), 0);

        // Calculate time taken: max(completed_at) - min(started_at) in seconds
        const startTimes = progress
          .filter(p => p.started_at)
          .map(p => new Date(p.started_at).getTime());
        const endTimes = progress
          .filter(p => p.completed_at)
          .map(p => new Date(p.completed_at).getTime());

        let timeTaken = 0;
        if (startTimes.length > 0 && endTimes.length > 0) {
          const minStart = Math.min(...startTimes);
          const maxEnd = Math.max(...endTimes);
          timeTaken = Math.max(0, Math.floor((maxEnd - minStart) / 1000));
        }

        const accuracy = questionsAnswered > 0
          ? ((questionsCorrect / questionsAnswered) * 100).toFixed(2)
          : 0;

        return {
          score: totalScore,
          questionsAnswered,
          questionsCorrect,
          accuracy,
          timeTaken,
          hintsUsed
        };
      } catch (supaError) {
        console.error('Supabase error in calculateFinalLevelMetrics, falling back to MySQL:', supaError);
      }
    }

    // MySQL fallback
    // Get all puzzle progress for this level
    const [progress] = await db.query(
      `SELECT 
         SUM(CASE WHEN tp.is_completed = true THEN p.points ELSE 0 END) as total_score,
         COUNT(*) as questions_answered,
         SUM(CASE WHEN tp.is_completed = true THEN 1 ELSE 0 END) as questions_correct,
         GREATEST(0, TIMESTAMPDIFF(SECOND, MIN(tp.started_at), MAX(COALESCE(tp.completed_at, NOW())))) as time_taken,
         SUM(COALESCE(tp.hints_used, 0)) as hints_used
       FROM team_progress tp
       JOIN puzzles p ON tp.puzzle_id = p.id
       WHERE tp.team_id = ? AND p.level = ?`,
      [teamId, levelId]
    );

    const metrics = progress[0] || {};
    const questionsAnswered = parseInt(metrics.questions_answered) || 0;
    const questionsCorrect = parseInt(metrics.questions_correct) || 0;

    return {
      score: parseInt(metrics.total_score) || 0,
      questionsAnswered,
      questionsCorrect,
      accuracy: questionsAnswered > 0 ? ((questionsCorrect / questionsAnswered) * 100).toFixed(2) : 0,
      timeTaken: parseInt(metrics.time_taken) || 0,
      hintsUsed: parseInt(metrics.hints_used) || 0
    };
  } catch (error) {
    console.error('Error calculating final metrics:', error);
    return { score: 0, questionsAnswered: 0, questionsCorrect: 0, accuracy: 0, timeTaken: 0, hintsUsed: 0 };
  }
}

/**
 * Run automatic qualification based on admin-configured cutoffs
 * @param {string} teamId - Team's UUID
 * @param {number} levelId - Level number
 * @param {Object} metrics - Team's performance metrics
 */
async function runAutoQualification(teamId, levelId, metrics) {
  try {
    let cutoff = null;

    if (USE_SUPABASE) {
      try {
        const { data: cutoffs, error } = await supabaseAdmin
          .from('qualification_cutoffs')
          .select('*')
          .eq('level_id', levelId)
          .eq('is_active', true);

        if (error) throw error;

        // No cutoffs configured - default to qualified
        if (!cutoffs || cutoffs.length === 0) {
          await setQualificationStatus(teamId, levelId, 'QUALIFIED', null, 'No cutoffs configured - auto-qualified');
          return { qualified: true, reason: 'No cutoffs configured', auto: true };
        }

        cutoff = cutoffs[0];
      } catch (supaError) {
        console.error('Supabase error in runAutoQualification, falling back to MySQL:', supaError);
        cutoff = null;
      }
    }

    if (!cutoff && !USE_SUPABASE) {
      // MySQL fallback
      const [cutoffs] = await db.query(
        'SELECT * FROM qualification_cutoffs WHERE level_id = ? AND is_active = true',
        [levelId]
      );

      // No cutoffs configured - default to qualified
      if (cutoffs.length === 0) {
        await setQualificationStatus(teamId, levelId, 'QUALIFIED', null, 'No cutoffs configured - auto-qualified');
        return { qualified: true, reason: 'No cutoffs configured', auto: true };
      }

      cutoff = cutoffs[0];
    }

    // If Supabase failed and we have no cutoff, fall back to MySQL
    if (!cutoff) {
      const [cutoffs] = await db.query(
        'SELECT * FROM qualification_cutoffs WHERE level_id = ? AND is_active = true',
        [levelId]
      );

      if (cutoffs.length === 0) {
        await setQualificationStatus(teamId, levelId, 'QUALIFIED', null, 'No cutoffs configured - auto-qualified');
        return { qualified: true, reason: 'No cutoffs configured', auto: true };
      }

      cutoff = cutoffs[0];
    }

    // If auto_qualify is disabled, leave as pending
    if (!cutoff.auto_qualify) {
      return { qualified: null, reason: 'Manual qualification required', auto: false, pending: true };
    }

    // Check all cutoff criteria
    const failures = [];

    if (metrics.score < cutoff.min_score) {
      failures.push(`Score (${metrics.score}) below minimum (${cutoff.min_score})`);
    }

    if (parseFloat(metrics.accuracy) < parseFloat(cutoff.min_accuracy)) {
      failures.push(`Accuracy (${metrics.accuracy}%) below minimum (${cutoff.min_accuracy}%)`);
    }

    if (metrics.timeTaken > cutoff.max_time_seconds) {
      failures.push(`Time (${Math.floor(metrics.timeTaken/60)}min) exceeded limit (${Math.floor(cutoff.max_time_seconds/60)}min)`);
    }

    if (metrics.hintsUsed > cutoff.max_hints_allowed) {
      failures.push(`Hints used (${metrics.hintsUsed}) exceeded limit (${cutoff.max_hints_allowed})`);
    }

    if (metrics.questionsCorrect < cutoff.min_questions_correct) {
      failures.push(`Correct answers (${metrics.questionsCorrect}) below minimum (${cutoff.min_questions_correct})`);
    }

    const qualified = failures.length === 0;
    const status = qualified ? 'QUALIFIED' : 'DISQUALIFIED';
    const reason = qualified 
      ? 'Met all qualification criteria' 
      : failures.join('; ');

    await setQualificationStatus(teamId, levelId, status, null, reason);

    // Create qualification message for team
    await createQualificationMessage(teamId, levelId, qualified, metrics, failures);

    const action = qualified ? 'AUTO_QUALIFIED' : 'AUTO_DISQUALIFIED';
    await logQualificationEvent(teamId, levelId, action, 'PENDING', status, null, reason, metrics);

    return { qualified, status, reason, failures, auto: true };
  } catch (error) {
    console.error('Error running auto-qualification:', error);
    throw error;
  }
}

/**
 * Set qualification status
 * @param {string} teamId - Team's UUID
 * @param {number} levelId - Level number
 * @param {string} status - PENDING, QUALIFIED, or DISQUALIFIED
 * @param {string} adminId - Admin's user ID (null for auto)
 * @param {string} reason - Reason for the status
 */
async function setQualificationStatus(teamId, levelId, status, adminId = null, reason = null) {
  try {
    const isManualOverride = adminId !== null;

    if (USE_SUPABASE) {
      try {
        const updateData = {
          qualification_status: status,
          qualification_decided_at: new Date().toISOString(),
          was_manually_overridden: isManualOverride,
          override_by: adminId,
          override_reason: reason,
          updated_at: new Date().toISOString()
        };
        if (adminId) {
          updateData.override_at = new Date().toISOString();
        }

        const { error } = await supabaseAdmin
          .from('team_level_status')
          .update(updateData)
          .eq('team_id', teamId)
          .eq('level_id', levelId);

        if (error) throw error;

        return { success: true };
      } catch (supaError) {
        console.error('Supabase error in setQualificationStatus, falling back to MySQL:', supaError);
      }
    }

    // MySQL fallback
    await db.query(
      `UPDATE team_level_status 
       SET qualification_status = ?,
           qualification_decided_at = NOW(),
           was_manually_overridden = ?,
           override_by = ?,
           override_reason = ?,
           override_at = CASE WHEN ? IS NOT NULL THEN NOW() ELSE override_at END,
           updated_at = NOW()
       WHERE team_id = ? AND level_id = ?`,
      [status, isManualOverride, adminId, reason, adminId, teamId, levelId]
    );

    return { success: true };
  } catch (error) {
    console.error('Error setting qualification status:', error);
    throw error;
  }
}

/**
 * Admin override: Force qualify or disqualify a team
 * @param {string} teamId - Team's UUID
 * @param {number} levelId - Level number
 * @param {string} newStatus - QUALIFIED or DISQUALIFIED
 * @param {string} adminId - Admin's user ID
 * @param {string} reason - Reason for the override
 */
async function adminOverrideQualification(teamId, levelId, newStatus, adminId, reason) {
  try {
    let currentRow = null;
    let previousStatus = 'PENDING';

    if (USE_SUPABASE) {
      try {
        const { data: current, error } = await supabaseAdmin
          .from('team_level_status')
          .select('qualification_status, score, accuracy, time_taken_seconds, hints_used')
          .eq('team_id', teamId)
          .eq('level_id', levelId);

        if (error) throw error;

        // Initialize if doesn't exist
        if (!current || current.length === 0) {
          await initializeLevelStatus(teamId, levelId);

          const { error: updateErr } = await supabaseAdmin
            .from('team_level_status')
            .update({
              status: 'COMPLETED',
              completed_at: new Date().toISOString(),
              updated_at: new Date().toISOString()
            })
            .eq('team_id', teamId)
            .eq('level_id', levelId);

          if (updateErr) throw updateErr;
        } else {
          currentRow = current[0];
          previousStatus = currentRow.qualification_status || 'PENDING';
        }

        // Set new status
        await setQualificationStatus(teamId, levelId, newStatus, adminId, reason);

        // Create message for team
        const qualified = newStatus === 'QUALIFIED';
        await createQualificationMessage(teamId, levelId, qualified, currentRow || {}, [], true);

        // Log the override
        const action = qualified ? 'ADMIN_QUALIFIED' : 'ADMIN_DISQUALIFIED';
        await logQualificationEvent(teamId, levelId, action, previousStatus, newStatus, adminId, reason, currentRow);

        return {
          success: true,
          previous_status: previousStatus,
          new_status: newStatus,
          overridden_by: adminId
        };
      } catch (supaError) {
        console.error('Supabase error in adminOverrideQualification, falling back to MySQL:', supaError);
      }
    }

    // MySQL fallback
    // Get current status
    const [current] = await db.query(
      'SELECT qualification_status, score, accuracy, time_taken_seconds, hints_used FROM team_level_status WHERE team_id = ? AND level_id = ?',
      [teamId, levelId]
    );

    // Initialize if doesn't exist
    if (current.length === 0) {
      await initializeLevelStatus(teamId, levelId);
      await db.query(
        `UPDATE team_level_status SET status = 'COMPLETED', completed_at = NOW() WHERE team_id = ? AND level_id = ?`,
        [teamId, levelId]
      );
    }

    previousStatus = current[0]?.qualification_status || 'PENDING';

    // Set new status
    await setQualificationStatus(teamId, levelId, newStatus, adminId, reason);

    // Create message for team
    const qualified = newStatus === 'QUALIFIED';
    await createQualificationMessage(teamId, levelId, qualified, current[0] || {}, [], true);

    // Log the override
    const action = qualified ? 'ADMIN_QUALIFIED' : 'ADMIN_DISQUALIFIED';
    await logQualificationEvent(teamId, levelId, action, previousStatus, newStatus, adminId, reason, current[0]);

    return {
      success: true,
      previous_status: previousStatus,
      new_status: newStatus,
      overridden_by: adminId
    };
  } catch (error) {
    console.error('Error in admin override:', error);
    throw error;
  }
}

/**
 * Create qualification message for team
 * @param {string} teamId - Team's UUID
 * @param {number} levelId - Level number
 * @param {boolean} qualified - Whether team qualified
 * @param {Object} metrics - Performance metrics
 * @param {Array} failures - List of failure reasons (if disqualified)
 * @param {boolean} isManualOverride - Whether this is from admin override
 */
async function createQualificationMessage(teamId, levelId, qualified, metrics, failures = [], isManualOverride = false) {
  try {
    const id = uuidv4();
    const messageType = qualified ? 'QUALIFICATION' : 'DISQUALIFICATION';

    let title, message;

    if (qualified) {
      title = '🎉 Congratulations! Level ' + levelId + ' Qualified!';
      message = isManualOverride
        ? `Great news! An administrator has qualified your team for Level ${levelId}. You can now proceed to Level ${levelId + 1}.`
        : `Excellent work! Your team has successfully qualified Level ${levelId} and earned access to Level ${levelId + 1}!\n\n` +
          `Your Performance:\n` +
          `• Score: ${metrics.score || 0} points\n` +
          `• Accuracy: ${metrics.accuracy || 0}%\n` +
          `• Time: ${Math.floor((metrics.timeTaken || metrics.time_taken_seconds || 0) / 60)} minutes\n` +
          `• Hints Used: ${metrics.hintsUsed || metrics.hints_used || 0}\n\n` +
          `Level ${levelId + 1} is now unlocked for your team!`;
    } else {
      title = '❌ Level ' + levelId + ' Not Qualified';
      message = isManualOverride
        ? `Unfortunately, an administrator has determined your team did not qualify for Level ${levelId}. Thank you for participating.`
        : `Unfortunately, your team did not meet the qualification criteria for Level ${levelId}.\n\n` +
          `Your Performance:\n` +
          `• Score: ${metrics.score || 0} points\n` +
          `• Accuracy: ${metrics.accuracy || 0}%\n` +
          `• Time: ${Math.floor((metrics.timeTaken || metrics.time_taken_seconds || 0) / 60)} minutes\n` +
          `• Hints Used: ${metrics.hintsUsed || metrics.hints_used || 0}\n\n` +
          `Areas for Improvement:\n${failures.map(f => `• ${f}`).join('\n') || '• Contact admin for details'}\n\n` +
          `Thank you for participating in Level ${levelId}!`;
    }

    if (USE_SUPABASE) {
      try {
        const { error } = await supabaseAdmin
          .from('team_qualification_messages')
          .insert({
            id,
            team_id: teamId,
            level_id: levelId,
            message_type: messageType,
            title,
            message
          });

        if (error) throw error;

        return { id, title, message, messageType };
      } catch (supaError) {
        console.error('Supabase error in createQualificationMessage, falling back to MySQL:', supaError);
      }
    }

    // MySQL fallback
    await db.query(
      `INSERT INTO team_qualification_messages (id, team_id, level_id, message_type, title, message)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [id, teamId, levelId, messageType, title, message]
    );

    return { id, title, message, messageType };
  } catch (error) {
    console.error('Error creating qualification message:', error);
    throw error;
  }
}

/**
 * Get qualification messages for a team
 * @param {string} teamId - Team's UUID
 * @param {boolean} unreadOnly - Only fetch unread messages
 */
async function getQualificationMessages(teamId, unreadOnly = false) {
  try {
    if (USE_SUPABASE) {
      try {
        let query = supabaseAdmin
          .from('team_qualification_messages')
          .select('*')
          .eq('team_id', teamId)
          .eq('is_dismissed', false);

        if (unreadOnly) {
          query = query.eq('is_read', false);
        }

        const { data: messages, error } = await query.order('created_at', { ascending: false });

        if (error) throw error;

        return messages || [];
      } catch (supaError) {
        console.error('Supabase error in getQualificationMessages, falling back to MySQL:', supaError);
      }
    }

    // MySQL fallback
    let query = `
      SELECT * FROM team_qualification_messages 
      WHERE team_id = ? AND is_dismissed = false
    `;

    if (unreadOnly) {
      query += ' AND is_read = false';
    }

    query += ' ORDER BY created_at DESC';

    const [messages] = await db.query(query, [teamId]);
    return messages;
  } catch (error) {
    console.error('Error getting qualification messages:', error);
    return [];
  }
}

/**
 * Mark qualification message as read
 * @param {string} messageId - Message UUID
 * @param {string} teamId - Team UUID (for verification)
 */
async function markMessageRead(messageId, teamId) {
  try {
    if (USE_SUPABASE) {
      try {
        const { error } = await supabaseAdmin
          .from('team_qualification_messages')
          .update({
            is_read: true,
            read_at: new Date().toISOString()
          })
          .eq('id', messageId)
          .eq('team_id', teamId);

        if (error) throw error;

        return { success: true };
      } catch (supaError) {
        console.error('Supabase error in markMessageRead, falling back to MySQL:', supaError);
      }
    }

    // MySQL fallback
    await db.query(
      `UPDATE team_qualification_messages 
       SET is_read = true, read_at = NOW()
       WHERE id = ? AND team_id = ?`,
      [messageId, teamId]
    );
    return { success: true };
  } catch (error) {
    console.error('Error marking message read:', error);
    return { success: false };
  }
}

/**
 * Dismiss qualification message
 * @param {string} messageId - Message UUID
 * @param {string} teamId - Team UUID (for verification)
 */
async function dismissMessage(messageId, teamId) {
  try {
    if (USE_SUPABASE) {
      try {
        const { error } = await supabaseAdmin
          .from('team_qualification_messages')
          .update({
            is_dismissed: true,
            dismissed_at: new Date().toISOString()
          })
          .eq('id', messageId)
          .eq('team_id', teamId);

        if (error) throw error;

        return { success: true };
      } catch (supaError) {
        console.error('Supabase error in dismissMessage, falling back to MySQL:', supaError);
      }
    }

    // MySQL fallback
    await db.query(
      `UPDATE team_qualification_messages 
       SET is_dismissed = true, dismissed_at = NOW()
       WHERE id = ? AND team_id = ?`,
      [messageId, teamId]
    );
    return { success: true };
  } catch (error) {
    console.error('Error dismissing message:', error);
    return { success: false };
  }
}

/**
 * Get team's level status summary
 * @param {string} teamId - Team's UUID
 */
async function getTeamLevelStatus(teamId) {
  try {
    let levels = [];

    if (USE_SUPABASE) {
      try {
        const { data, error } = await supabaseAdmin
          .from('team_level_status')
          .select('*')
          .eq('team_id', teamId)
          .order('level_id', { ascending: true });

        if (error) throw error;

        levels = data || [];
      } catch (supaError) {
        console.error('Supabase error in getTeamLevelStatus, falling back to MySQL:', supaError);
        levels = null; // signal to use MySQL
      }
    }

    if (levels === null || (!USE_SUPABASE)) {
      // MySQL fallback
      const [rows] = await db.query(
        `SELECT * FROM team_level_status WHERE team_id = ? ORDER BY level_id`,
        [teamId]
      );
      levels = rows;
    }

    // Structure by level
    const levelStatus = {};
    for (const level of levels) {
      levelStatus[level.level_id] = {
        status: level.status,
        qualification_status: level.qualification_status,
        score: level.score,
        accuracy: level.accuracy,
        time_taken_seconds: level.time_taken_seconds,
        hints_used: level.hints_used,
        started_at: level.started_at,
        completed_at: level.completed_at,
        was_manually_overridden: level.was_manually_overridden
      };
    }

    // Check Level 2 access
    const canAccessLevel2 = levelStatus[1]?.qualification_status === 'QUALIFIED';

    return {
      levels: levelStatus,
      can_access_level_2: canAccessLevel2,
      current_level: canAccessLevel2 ? (levelStatus[2]?.status === 'NOT_STARTED' ? 2 : 2) : 1
    };
  } catch (error) {
    console.error('Error getting team level status:', error);
    return { levels: {}, can_access_level_2: false, current_level: 1 };
  }
}

/**
 * Get cutoff configuration for admin
 * @param {number} levelId - Level number (optional, returns all if not specified)
 */
async function getQualificationCutoffs(levelId = null) {
  try {
    if (USE_SUPABASE) {
      try {
        let query = supabaseAdmin
          .from('qualification_cutoffs')
          .select('*');

        if (levelId !== null) {
          query = query.eq('level_id', levelId);
        }

        const { data: cutoffs, error } = await query.order('level_id', { ascending: true });

        if (error) throw error;

        return cutoffs || [];
      } catch (supaError) {
        console.error('Supabase error in getQualificationCutoffs, falling back to MySQL:', supaError);
      }
    }

    // MySQL fallback
    let query = 'SELECT * FROM qualification_cutoffs';
    const params = [];

    if (levelId !== null) {
      query += ' WHERE level_id = ?';
      params.push(levelId);
    }

    query += ' ORDER BY level_id';

    const [cutoffs] = await db.query(query, params);
    return cutoffs;
  } catch (error) {
    console.error('Error getting cutoffs:', error);
    return [];
  }
}

/**
 * Update qualification cutoffs (admin only)
 * @param {number} levelId - Level number
 * @param {Object} cutoffData - New cutoff values
 * @param {string} adminId - Admin's user ID
 */
async function updateQualificationCutoffs(levelId, cutoffData, adminId) {
  try {
    const { min_score, min_accuracy, max_time_seconds, max_hints_allowed, min_questions_correct, is_active, auto_qualify } = cutoffData;

    if (USE_SUPABASE) {
      try {
        const updateObj = {};
        if (min_score !== undefined && min_score !== null) updateObj.min_score = min_score;
        if (min_accuracy !== undefined && min_accuracy !== null) updateObj.min_accuracy = min_accuracy;
        if (max_time_seconds !== undefined && max_time_seconds !== null) updateObj.max_time_seconds = max_time_seconds;
        if (max_hints_allowed !== undefined && max_hints_allowed !== null) updateObj.max_hints_allowed = max_hints_allowed;
        if (min_questions_correct !== undefined && min_questions_correct !== null) updateObj.min_questions_correct = min_questions_correct;
        if (is_active !== undefined && is_active !== null) updateObj.is_active = is_active;
        if (auto_qualify !== undefined && auto_qualify !== null) updateObj.auto_qualify = auto_qualify;
        updateObj.updated_by = adminId;
        updateObj.updated_at = new Date().toISOString();

        const { error } = await supabaseAdmin
          .from('qualification_cutoffs')
          .update(updateObj)
          .eq('level_id', levelId);

        if (error) throw error;

        // Log the change
        await logQualificationEvent(null, levelId, 'CUTOFF_UPDATED', null, null, adminId, JSON.stringify(cutoffData));

        return { success: true };
      } catch (supaError) {
        console.error('Supabase error in updateQualificationCutoffs, falling back to MySQL:', supaError);
      }
    }

    // MySQL fallback
    await db.query(
      `UPDATE qualification_cutoffs 
       SET min_score = COALESCE(?, min_score),
           min_accuracy = COALESCE(?, min_accuracy),
           max_time_seconds = COALESCE(?, max_time_seconds),
           max_hints_allowed = COALESCE(?, max_hints_allowed),
           min_questions_correct = COALESCE(?, min_questions_correct),
           is_active = COALESCE(?, is_active),
           auto_qualify = COALESCE(?, auto_qualify),
           updated_by = ?,
           updated_at = NOW()
       WHERE level_id = ?`,
      [min_score, min_accuracy, max_time_seconds, max_hints_allowed, min_questions_correct, is_active, auto_qualify, adminId, levelId]
    );

    // Log the change
    await logQualificationEvent(null, levelId, 'CUTOFF_UPDATED', null, null, adminId, JSON.stringify(cutoffData));

    return { success: true };
  } catch (error) {
    console.error('Error updating cutoffs:', error);
    throw error;
  }
}

/**
 * Get all teams' qualification status (for admin dashboard)
 */
async function getAllTeamsQualificationStatus() {
  try {
    if (USE_SUPABASE) {
      try {
        // Step 1: Fetch all teams
        const { data: teams, error: teamsErr } = await supabaseAdmin
          .from('teams')
          .select('id, team_name, status');

        if (teamsErr) throw teamsErr;

        if (!teams || teams.length === 0) return [];

        // Step 2: Fetch all team_level_status
        let allLevelStatus = [];
        try {
          const { data: levelStatusRows, error: lsErr } = await supabaseAdmin
            .from('team_level_status')
            .select('*');

          if (lsErr) throw lsErr;
          allLevelStatus = levelStatusRows || [];
        } catch (lsError) {
          console.error('Could not fetch team_level_status (table may not exist):', lsError);
          allLevelStatus = [];
        }

        // Step 3: Merge in JS - group by team
        const teamsMap = {};
        for (const team of teams) {
          teamsMap[team.id] = {
            id: team.id,
            team_name: team.team_name,
            team_status: team.status,
            levels: {}
          };
        }

        for (const row of allLevelStatus) {
          if (teamsMap[row.team_id]) {
            teamsMap[row.team_id].levels[row.level_id] = {
              status: row.status,
              qualification_status: row.qualification_status,
              score: row.score,
              accuracy: row.accuracy,
              time_taken_seconds: row.time_taken_seconds,
              hints_used: row.hints_used,
              completed_at: row.completed_at,
              was_manually_overridden: row.was_manually_overridden,
              override_by: row.override_by,
              override_reason: row.override_reason
            };
          }
        }

        return Object.values(teamsMap);
      } catch (supaError) {
        console.error('Supabase error in getAllTeamsQualificationStatus, falling back to MySQL:', supaError);
      }
    }

    // MySQL fallback
    const [teams] = await db.query(`
      SELECT 
        t.id,
        t.team_name,
        t.status as team_status,
        tls.level_id,
        tls.status as level_status,
        tls.qualification_status,
        tls.score,
        tls.accuracy,
        tls.time_taken_seconds,
        tls.hints_used,
        tls.completed_at,
        tls.was_manually_overridden,
        tls.override_by,
        tls.override_reason
      FROM teams t
      LEFT JOIN team_level_status tls ON t.id = tls.team_id
      ORDER BY t.team_name, tls.level_id
    `);

    // Group by team
    const teamsMap = {};
    for (const row of teams) {
      if (!teamsMap[row.id]) {
        teamsMap[row.id] = {
          id: row.id,
          team_name: row.team_name,
          team_status: row.team_status,
          levels: {}
        };
      }

      if (row.level_id) {
        teamsMap[row.id].levels[row.level_id] = {
          status: row.level_status,
          qualification_status: row.qualification_status,
          score: row.score,
          accuracy: row.accuracy,
          time_taken_seconds: row.time_taken_seconds,
          hints_used: row.hints_used,
          completed_at: row.completed_at,
          was_manually_overridden: row.was_manually_overridden,
          override_by: row.override_by,
          override_reason: row.override_reason
        };
      }
    }

    return Object.values(teamsMap);
  } catch (error) {
    console.error('Error getting all teams qualification status:', error);
    return [];
  }
}

/**
 * Log qualification event to audit log
 */
async function logQualificationEvent(teamId, levelId, action, previousStatus, newStatus, performedBy = null, reason = null, metricsSnapshot = null) {
  try {
    const id = uuidv4();

    if (USE_SUPABASE) {
      try {
        const { error } = await supabaseAdmin
          .from('qualification_audit_log')
          .insert({
            id,
            team_id: teamId,
            level_id: levelId,
            action,
            previous_status: previousStatus,
            new_status: newStatus,
            score_snapshot: metricsSnapshot?.score || null,
            accuracy_snapshot: metricsSnapshot?.accuracy || null,
            time_snapshot: metricsSnapshot?.timeTaken || metricsSnapshot?.time_taken_seconds || null,
            hints_snapshot: metricsSnapshot?.hintsUsed || metricsSnapshot?.hints_used || null,
            performed_by: performedBy,
            reason
          });

        if (error) throw error;

        return { success: true };
      } catch (supaError) {
        console.error('Supabase error in logQualificationEvent (table may not exist):', supaError);
        // Don't throw - logging failures shouldn't break main flow
        return { success: false };
      }
    }

    // MySQL fallback
    await db.query(
      `INSERT INTO qualification_audit_log 
       (id, team_id, level_id, action, previous_status, new_status, 
        score_snapshot, accuracy_snapshot, time_snapshot, hints_snapshot,
        performed_by, reason)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id,
        teamId,
        levelId,
        action,
        previousStatus,
        newStatus,
        metricsSnapshot?.score || null,
        metricsSnapshot?.accuracy || null,
        metricsSnapshot?.timeTaken || metricsSnapshot?.time_taken_seconds || null,
        metricsSnapshot?.hintsUsed || metricsSnapshot?.hints_used || null,
        performedBy,
        reason
      ]
    );

    return { success: true };
  } catch (error) {
    console.error('Error logging qualification event:', error);
    // Don't throw - logging failures shouldn't break main flow
    return { success: false };
  }
}

module.exports = {
  // Level Status Management
  initializeLevelStatus,
  updateLevelProgress,
  completeLevelAndQualify,
  getTeamLevelStatus,

  // Qualification
  runAutoQualification,
  setQualificationStatus,
  adminOverrideQualification,

  // Messages
  createQualificationMessage,
  getQualificationMessages,
  markMessageRead,
  dismissMessage,

  // Cutoffs
  getQualificationCutoffs,
  updateQualificationCutoffs,

  // Admin
  getAllTeamsQualificationStatus,

  // Audit
  logQualificationEvent
};
