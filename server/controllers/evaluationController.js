/**
 * ==============================================
 * EVALUATION CONTROLLER
 * ==============================================
 * Admin-controlled evaluation & result release
 * 
 * NEW CODE - Added for Admin-Controlled Evaluation System
 * 
 * This controller handles:
 * - Closing submissions for a level
 * - Evaluating all pending answers
 * - Publishing results to teams
 * - Getting evaluation status
 */

const db = require('../config/db');
const { supabaseAdmin } = require('../config/supabase');
const { v4: uuidv4 } = require('uuid');
const qualificationService = require('../services/qualificationService');

const USE_SUPABASE = process.env.USE_SUPABASE === 'true';

// ============================================
// HELPER FUNCTIONS
// ============================================

/**
 * Get current evaluation state for a level
 */
async function getLevelEvaluationState(levelId) {
  if (USE_SUPABASE) {
    try {
      const { data } = await supabaseAdmin
        .from('level_evaluation_state').select('*').eq('level_id', levelId);
      return data?.[0] || null;
    } catch (e) {
      console.log('level_evaluation_state table may not exist:', e.message);
      return null;
    }
  }
  const [state] = await db.query(
    'SELECT * FROM level_evaluation_state WHERE level_id = ?',
    [levelId]
  );
  return state[0] || null;
}

/**
 * Log evaluation action for audit
 */
async function logEvaluationAction(levelId, action, adminId, adminName, stats = {}, details = null) {
  const id = uuidv4();
  if (USE_SUPABASE) {
    try {
      await supabaseAdmin.from('evaluation_audit_log').insert({
        id, level_id: levelId, action, admin_id: adminId, admin_name: adminName,
        teams_evaluated: stats.teamsEvaluated || 0,
        submissions_evaluated: stats.submissionsEvaluated || 0,
        details: details ? JSON.stringify(details) : null
      });
    } catch (e) {
      console.log('evaluation_audit_log table may not exist:', e.message);
    }
    return;
  }
  await db.query(
    `INSERT INTO evaluation_audit_log 
     (id, level_id, action, admin_id, admin_name, teams_evaluated, submissions_evaluated, details)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      id,
      levelId,
      action,
      adminId,
      adminName,
      stats.teamsEvaluated || 0,
      stats.submissionsEvaluated || 0,
      details ? JSON.stringify(details) : null
    ]
  );
}

// ============================================
// ADMIN ENDPOINTS
// ============================================

/**
 * GET /api/admin/level/:levelId/evaluation-status
 * Get current evaluation status for a level
 */
exports.getEvaluationStatus = async (req, res) => {
  try {
    const { levelId } = req.params;
    const levelIdInt = parseInt(levelId);

    // Check if Level 2 is unlocked before returning its status
    if (levelIdInt === 2) {
      try {
        if (USE_SUPABASE) {
          const { data: gameStateData } = await supabaseAdmin
            .from('game_state')
            .select('level2_open')
            .limit(1);
          const level2Open = gameStateData?.[0]?.level2_open || false;
          
          if (!level2Open) {
            return res.json({
              success: true,
              level_id: levelIdInt,
              evaluation_state: 'NOT_UNLOCKED',
              timestamps: {},
              submissions: { total_submissions: 0, pending: 0, evaluated: 0, teams_with_submissions: 0 },
              teams: { total: 0, qualified: 0, disqualified: 0, pending: 0 },
              actions: {
                can_close_submissions: false,
                can_reopen_submissions: false,
                can_evaluate: false,
                can_publish: false
              }
            });
          }
        } else {
          const [gameStateRows] = await db.query(
            'SELECT level2_open FROM game_state LIMIT 1'
          );
          const level2Open = gameStateRows?.[0]?.level2_open || false;
          
          if (!level2Open) {
            return res.json({
              success: true,
              level_id: levelIdInt,
              evaluation_state: 'NOT_UNLOCKED',
              timestamps: {},
              submissions: { total_submissions: 0, pending: 0, evaluated: 0, teams_with_submissions: 0 },
              teams: { total: 0, qualified: 0, disqualified: 0, pending: 0 },
              actions: {
                can_close_submissions: false,
                can_reopen_submissions: false,
                can_evaluate: false,
                can_publish: false
              }
            });
          }
        }
      } catch (error) {
        console.log('Error checking level2_open status:', error.message);
      }
    }

    // ---- SUPABASE BRANCH ----
    if (USE_SUPABASE) {
      let levelState = null;
      try {
        levelState = await getLevelEvaluationState(levelIdInt);
      } catch (e) {
        console.log('getLevelEvaluationState error:', e.message);
      }

      if (!levelState) {
        // Initialize if doesn't exist
        try {
          await supabaseAdmin.from('level_evaluation_state').insert({
            id: uuidv4(),
            level_id: levelIdInt,
            evaluation_state: 'IN_PROGRESS'
          });
        } catch (e) {
          console.log('Insert level_evaluation_state error:', e.message);
        }
        return res.json({
          success: true,
          level_id: levelIdInt,
          evaluation_state: 'IN_PROGRESS',
          timestamps: {},
          submissions: { total_submissions: 0, pending: 0, evaluated: 0, teams_with_submissions: 0 },
          teams: { total: 0, qualified: 0, disqualified: 0, pending: 0 },
          actions: {
            can_close_submissions: true,
            can_evaluate: false,
            can_publish: false
          }
        });
      }

      // Get submission stats
      let submissionStats = { total_submissions: 0, pending: 0, evaluated: 0, teams_with_submissions: 0 };
      try {
        const { data: puzzles } = await supabaseAdmin
          .from('puzzles').select('id').eq('level', levelIdInt);
        const puzzleIds = (puzzles || []).map(p => p.id);

        if (puzzleIds.length > 0) {
          const { data: submissions } = await supabaseAdmin
            .from('submissions').select('team_id, evaluation_status, puzzle_id')
            .in('puzzle_id', puzzleIds);
          const levelSubmissions = submissions || [];
          const teamsWithSubmissions = new Set(levelSubmissions.map(s => s.team_id));
          submissionStats = {
            total_submissions: levelSubmissions.length,
            pending: levelSubmissions.filter(s => s.evaluation_status === 'PENDING' || s.evaluation_status === null).length,
            evaluated: levelSubmissions.filter(s => s.evaluation_status === 'EVALUATED').length,
            teams_with_submissions: teamsWithSubmissions.size
          };
        }
      } catch (e) {
        console.log('Error fetching submission stats:', e.message);
      }

      // Get team stats
      let teamStats = { total: 0, qualified: 0, disqualified: 0, pending: 0 };
      try {
        const { data: teamLevelStatus } = await supabaseAdmin
          .from('team_level_status').select('qualification_status').eq('level_id', levelIdInt);
        const rows = teamLevelStatus || [];
        teamStats = {
          total: rows.length,
          qualified: rows.filter(r => r.qualification_status === 'QUALIFIED').length,
          disqualified: rows.filter(r => r.qualification_status === 'DISQUALIFIED').length,
          pending: rows.filter(r => r.qualification_status === 'PENDING').length
        };
      } catch (e) {
        console.log('Error fetching team stats:', e.message);
      }

      const canCloseSubmissions = levelState.evaluation_state === 'IN_PROGRESS';
      const canReopenSubmissions = levelState.evaluation_state !== 'IN_PROGRESS';
      const canEvaluate = levelState.evaluation_state === 'SUBMISSIONS_CLOSED';
      const canPublish = levelState.evaluation_state === 'EVALUATING';

      return res.json({
        success: true,
        level_id: levelIdInt,
        evaluation_state: levelState.evaluation_state,
        timestamps: {
          submissions_closed_at: levelState.submissions_closed_at,
          evaluation_started_at: levelState.evaluation_started_at,
          evaluated_at: levelState.evaluated_at,
          results_published_at: levelState.results_published_at
        },
        submissions: submissionStats,
        teams: teamStats,
        actions: {
          can_close_submissions: canCloseSubmissions,
          can_reopen_submissions: canReopenSubmissions,
          can_evaluate: canEvaluate,
          can_publish: canPublish
        }
      });
    }

    // ---- MYSQL FALLBACK ----
    let levelState = null;
    try {
      const [state] = await db.query(
        'SELECT * FROM level_evaluation_state WHERE level_id = ?',
        [levelIdInt]
      );
      if (state && state.length > 0) {
        levelState = state[0];
      }
    } catch (e) {
      console.log('level_evaluation_state table may not exist:', e.message);
    }
    
    if (!levelState) {
      try {
        const id = uuidv4();
        await db.query(
          'INSERT INTO level_evaluation_state (id, level_id, evaluation_state) VALUES (?, ?, ?)',
          [id, levelIdInt, 'IN_PROGRESS']
        );
      } catch (e) {
        // Ignore if insert fails
      }
      return res.json({
        success: true,
        level_id: levelIdInt,
        evaluation_state: 'IN_PROGRESS',
        timestamps: {},
        submissions: { total_submissions: 0, pending: 0, evaluated: 0, teams_with_submissions: 0 },
        teams: { total: 0, qualified: 0, disqualified: 0, pending: 0 },
        actions: {
          can_close_submissions: true,
          can_evaluate: false,
          can_publish: false
        }
      });
    }
    
    let submissionStats = { total_submissions: 0, pending: 0, evaluated: 0, teams_with_submissions: 0 };
    try {
      const [puzzles] = await db.query('SELECT id FROM puzzles WHERE level = ?', [levelIdInt]);
      const puzzleIds = (puzzles || []).map(p => p.id);
      
      if (puzzleIds.length > 0) {
        const [submissions] = await db.query('SELECT team_id, evaluation_status, puzzle_id FROM submissions WHERE puzzle_id IN (?)', [puzzleIds]);
        const levelSubmissions = submissions || [];
        
        const teamsWithSubmissions = new Set(levelSubmissions.map(s => s.team_id));
        submissionStats = {
          total_submissions: levelSubmissions.length,
          pending: levelSubmissions.filter(s => s.evaluation_status === 'PENDING' || s.evaluation_status === null).length,
          evaluated: levelSubmissions.filter(s => s.evaluation_status === 'EVALUATED').length,
          teams_with_submissions: teamsWithSubmissions.size
        };
      }
    } catch (e) {
      // Tables may not exist
    }
    
    let teamStats = { total: 0, qualified: 0, disqualified: 0, pending: 0 };
    try {
      const [teamLevelStatus] = await db.query('SELECT qualification_status FROM team_level_status WHERE level_id = ?', [levelIdInt]);
      const rows = teamLevelStatus || [];
      teamStats = {
        total: rows.length,
        qualified: rows.filter(r => r.qualification_status === 'QUALIFIED').length,
        disqualified: rows.filter(r => r.qualification_status === 'DISQUALIFIED').length,
        pending: rows.filter(r => r.qualification_status === 'PENDING').length
      };
    } catch (e) {
      // Table may not exist
    }
    
    const canCloseSubmissions = levelState.evaluation_state === 'IN_PROGRESS';
    const canReopenSubmissions = levelState.evaluation_state !== 'IN_PROGRESS';
    const canEvaluate = levelState.evaluation_state === 'SUBMISSIONS_CLOSED';
    const canPublish = levelState.evaluation_state === 'EVALUATING';
    
    res.json({
      success: true,
      level_id: levelIdInt,
      evaluation_state: levelState.evaluation_state,
      timestamps: {
        submissions_closed_at: levelState.submissions_closed_at,
        evaluation_started_at: levelState.evaluation_started_at,
        evaluated_at: levelState.evaluated_at,
        results_published_at: levelState.results_published_at
      },
      submissions: submissionStats,
      teams: teamStats,
      actions: {
        can_close_submissions: canCloseSubmissions,
        can_reopen_submissions: canReopenSubmissions,
        can_evaluate: canEvaluate,
        can_publish: canPublish
      }
    });
  } catch (error) {
    console.error('Error getting evaluation status:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get evaluation status'
    });
  }
};

/**
 * POST /api/admin/level/:levelId/close-submissions
 * Close submissions for a level - teams can no longer submit answers
 */
exports.closeSubmissions = async (req, res) => {
  try {
    const { levelId } = req.params;
    const adminId = req.user.userId || req.user.id;
    const adminName = req.user.name || 'Admin';

    // Check current state
    const currentState = await getLevelEvaluationState(levelId);

    if (USE_SUPABASE) {
      try {
        if (!currentState) {
          await supabaseAdmin.from('level_evaluation_state').insert({
            id: uuidv4(), level_id: parseInt(levelId),
            evaluation_state: 'SUBMISSIONS_CLOSED',
            submissions_closed_at: new Date().toISOString(), closed_by: adminId
          });
        } else if (currentState.evaluation_state !== 'IN_PROGRESS') {
          return res.status(400).json({
            success: false,
            message: `Cannot close submissions. Current state: ${currentState.evaluation_state}`
          });
        } else {
          await supabaseAdmin.from('level_evaluation_state')
            .update({
              evaluation_state: 'SUBMISSIONS_CLOSED',
              submissions_closed_at: new Date().toISOString(),
              closed_by: adminId, updated_at: new Date().toISOString()
            })
            .eq('level_id', parseInt(levelId));
        }
      } catch (e) {
        console.log('level_evaluation_state table may not exist:', e.message);
      }

      // Count teams with submissions at this level
      let count = 0;
      try {
        const { data: puzzlesAtLevel } = await supabaseAdmin
          .from('puzzles').select('id').eq('level', parseInt(levelId));
        const puzzleIds = (puzzlesAtLevel || []).map(p => p.id);
        if (puzzleIds.length > 0) {
          const { data: subs } = await supabaseAdmin
            .from('submissions').select('team_id').in('puzzle_id', puzzleIds);
          const uniqueTeams = new Set((subs || []).map(s => s.team_id));
          count = uniqueTeams.size;
        }
      } catch (e) { /* ignore */ }

      await logEvaluationAction(levelId, 'SUBMISSIONS_CLOSED', adminId, adminName, { teamsEvaluated: count });

      return res.json({
        success: true,
        message: `Submissions closed for Level ${levelId}`,
        teams_affected: count
      });
    }

    // MySQL fallback
    if (!currentState) {
      const id = uuidv4();
      await db.query(
        `INSERT INTO level_evaluation_state 
         (id, level_id, evaluation_state, submissions_closed_at, closed_by)
         VALUES (?, ?, 'SUBMISSIONS_CLOSED', NOW(), ?)`,
        [id, levelId, adminId]
      );
    } else if (currentState.evaluation_state !== 'IN_PROGRESS') {
      return res.status(400).json({
        success: false,
        message: `Cannot close submissions. Current state: ${currentState.evaluation_state}`
      });
    } else {
      await db.query(
        `UPDATE level_evaluation_state 
         SET evaluation_state = 'SUBMISSIONS_CLOSED',
             submissions_closed_at = NOW(),
             closed_by = ?,
             updated_at = NOW()
         WHERE level_id = ?`,
        [adminId, levelId]
      );
    }
    
    const [[{ count }]] = await db.query(`
      SELECT COUNT(DISTINCT team_id) as count
      FROM submissions s
      JOIN puzzles p ON s.puzzle_id = p.id
      WHERE p.level = ?
    `, [levelId]);
    
    await logEvaluationAction(levelId, 'SUBMISSIONS_CLOSED', adminId, adminName, {
      teamsEvaluated: count
    });
    
    res.json({
      success: true,
      message: `Submissions closed for Level ${levelId}`,
      teams_affected: count
    });
  } catch (error) {
    console.error('Error closing submissions:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to close submissions'
    });
  }
};

/**
 * POST /api/admin/level/:levelId/evaluate
 * Evaluate all pending answers for a level
 * This compares answers to correct answers and sets scores
 */
exports.evaluateAnswers = async (req, res) => {
  try {
    const { levelId } = req.params;
    const adminId = req.user.userId || req.user.id;
    const adminName = req.user.name || 'Admin';
    
    // Check current state
    const currentState = await getLevelEvaluationState(levelId);
    
    if (!currentState) {
      return res.status(400).json({
        success: false,
        message: 'Level evaluation state not initialized. Close submissions first.'
      });
    }
    
    if (currentState.evaluation_state !== 'SUBMISSIONS_CLOSED') {
      return res.status(400).json({
        success: false,
        message: `Cannot evaluate. Current state: ${currentState.evaluation_state}. Must close submissions first.`
      });
    }

    // ---- SUPABASE BRANCH ----
    if (USE_SUPABASE) {
      // Update state to EVALUATING
      try {
        await supabaseAdmin.from('level_evaluation_state')
          .update({
            evaluation_state: 'EVALUATING',
            evaluation_started_at: new Date().toISOString(),
            evaluated_by: adminId,
            updated_at: new Date().toISOString()
          })
          .eq('level_id', parseInt(levelId));
      } catch (e) {
        console.log('Error updating level_evaluation_state:', e.message);
      }

      // Get puzzles for this level
      let puzzles = [];
      try {
        const { data } = await supabaseAdmin
          .from('puzzles')
          .select('id, correct_answer, points, level, puzzle_number')
          .eq('level', parseInt(levelId));
        puzzles = data || [];
      } catch (e) {
        console.log('Error fetching puzzles:', e.message);
      }

      const puzzleIds = puzzles.map(p => p.id);
      const puzzleMap = {};
      for (const p of puzzles) {
        puzzleMap[p.id] = p;
      }

      // Get all submissions for those puzzle IDs
      let pendingSubmissions = [];
      if (puzzleIds.length > 0) {
        try {
          const { data } = await supabaseAdmin
            .from('submissions')
            .select('id, team_id, puzzle_id, submitted_answer, is_correct, time_taken_seconds, evaluation_status')
            .in('puzzle_id', puzzleIds);
          pendingSubmissions = data || [];
        } catch (e) {
          console.log('Error fetching submissions:', e.message);
        }
      }

      // Merge puzzle data into submissions
      const mergedSubmissions = pendingSubmissions.map(s => ({
        ...s,
        correct_answer: puzzleMap[s.puzzle_id]?.correct_answer,
        points: puzzleMap[s.puzzle_id]?.points || 0,
        level: puzzleMap[s.puzzle_id]?.level,
        puzzle_number: puzzleMap[s.puzzle_id]?.puzzle_number
      }));

      let evaluatedCount = 0;
      let correctCount = 0;
      const teamScores = {};
      const teamStats = {};

      // Process each submission
      for (const submission of mergedSubmissions) {
        const submittedTrimmed = (submission.submitted_answer || '').trim().toLowerCase();
        const correctTrimmed = (submission.correct_answer || '').trim().toLowerCase();
        const isCorrect = submittedTrimmed === correctTrimmed;

        const scoreAwarded = isCorrect ? submission.points : 0;

        // Update submission record
        try {
          await supabaseAdmin.from('submissions')
            .update({
              is_correct: isCorrect,
              evaluation_status: 'EVALUATED',
              score_awarded: scoreAwarded,
              evaluated_at: new Date().toISOString()
            })
            .eq('id', submission.id);
        } catch (e) {
          console.log('Error updating submission:', e.message);
        }

        // Track team stats
        if (!teamScores[submission.team_id]) {
          teamScores[submission.team_id] = 0;
          teamStats[submission.team_id] = {
            questionsAnswered: 0,
            questionsCorrect: 0,
            hintsUsed: 0,
            timeTaken: 0
          };
        }

        teamScores[submission.team_id] += scoreAwarded;
        teamStats[submission.team_id].questionsAnswered++;
        if (isCorrect) {
          teamStats[submission.team_id].questionsCorrect++;
          correctCount++;
        }
        teamStats[submission.team_id].timeTaken += submission.time_taken_seconds || 0;

        evaluatedCount++;
      }

      // Get all teams that have started this level
      let allTeamIds = [];
      try {
        const { data: teamLevelStatus } = await supabaseAdmin
          .from('team_level_status')
          .select('team_id')
          .eq('level_id', parseInt(levelId));
        allTeamIds = (teamLevelStatus || []).map(t => t.team_id);
      } catch (e) {
        console.log('Error fetching team_level_status:', e.message);
      }

      // Add teams from submissions that might not have a team_level_status yet
      for (const teamId of Object.keys(teamScores)) {
        if (!allTeamIds.includes(teamId)) {
          allTeamIds.push(teamId);
        }
      }

      // Update team_level_status for each team
      for (const teamId of allTeamIds) {
        const stats = teamStats[teamId] || {
          questionsAnswered: 0,
          questionsCorrect: 0,
          hintsUsed: 0,
          timeTaken: 0
        };
        const score = teamScores[teamId] || 0;
        const accuracy = stats.questionsAnswered > 0
          ? ((stats.questionsCorrect / stats.questionsAnswered) * 100).toFixed(2)
          : 0;

        // Get hints used for this level from team_progress
        try {
          const { data: progressRows } = await supabaseAdmin
            .from('team_progress')
            .select('hints_used, puzzle_id')
            .eq('team_id', teamId)
            .in('puzzle_id', puzzleIds);
          const totalHints = (progressRows || []).reduce((sum, r) => sum + (r.hints_used || 0), 0);
          stats.hintsUsed = totalHints;
        } catch (e) {
          console.log('Error fetching hints:', e.message);
          stats.hintsUsed = 0;
        }

        // Upsert team_level_status
        try {
          const { data: existing } = await supabaseAdmin
            .from('team_level_status')
            .select('id, completed_at')
            .eq('team_id', teamId)
            .eq('level_id', parseInt(levelId));

          if (existing && existing.length > 0) {
            await supabaseAdmin.from('team_level_status')
              .update({
                score,
                questions_answered: stats.questionsAnswered,
                questions_correct: stats.questionsCorrect,
                accuracy: parseFloat(accuracy),
                time_taken_seconds: stats.timeTaken,
                hints_used: stats.hintsUsed,
                status: 'COMPLETED',
                completed_at: existing[0].completed_at || new Date().toISOString(),
                updated_at: new Date().toISOString()
              })
              .eq('team_id', teamId)
              .eq('level_id', parseInt(levelId));
          } else {
            await supabaseAdmin.from('team_level_status').insert({
              id: uuidv4(),
              team_id: teamId,
              level_id: parseInt(levelId),
              status: 'COMPLETED',
              score,
              questions_answered: stats.questionsAnswered,
              questions_correct: stats.questionsCorrect,
              accuracy: parseFloat(accuracy),
              time_taken_seconds: stats.timeTaken,
              hints_used: stats.hintsUsed,
              completed_at: new Date().toISOString()
            });
          }
        } catch (e) {
          console.log('Error upserting team_level_status:', e.message);
        }

        // Run auto-qualification for each team
        try {
          await qualificationService.runAutoQualification(teamId, parseInt(levelId), {
            score,
            questionsAnswered: stats.questionsAnswered,
            questionsCorrect: stats.questionsCorrect,
            accuracy: parseFloat(accuracy),
            timeTaken: stats.timeTaken,
            hintsUsed: stats.hintsUsed
          });
        } catch (qualError) {
          console.error(`Error running qualification for team ${teamId}:`, qualError);
        }
      }

      // Update evaluation state with completion timestamp
      try {
        await supabaseAdmin.from('level_evaluation_state')
          .update({
            evaluated_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
          })
          .eq('level_id', parseInt(levelId));
      } catch (e) {
        console.log('Error updating evaluated_at:', e.message);
      }

      // Log action
      await logEvaluationAction(levelId, 'EVALUATION_COMPLETED', adminId, adminName, {
        teamsEvaluated: allTeamIds.length,
        submissionsEvaluated: evaluatedCount
      }, {
        correct_submissions: correctCount,
        total_submissions: evaluatedCount
      });

      return res.json({
        success: true,
        message: `Evaluation completed for Level ${levelId}`,
        stats: {
          teams_evaluated: allTeamIds.length,
          submissions_evaluated: evaluatedCount,
          correct_answers: correctCount
        }
      });
    }

    // ---- MYSQL FALLBACK ----
    // Update state to EVALUATING
    await db.query(
      `UPDATE level_evaluation_state 
       SET evaluation_state = 'EVALUATING',
           evaluation_started_at = NOW(),
           evaluated_by = ?,
           updated_at = NOW()
       WHERE level_id = ?`,
      [adminId, levelId]
    );
    
    // Get all submissions for this level
    const [pendingSubmissions] = await db.query(`
      SELECT s.id, s.team_id, s.puzzle_id, s.submitted_answer, s.is_correct, s.time_taken_seconds,
             p.correct_answer, p.points, p.level, p.puzzle_number
      FROM submissions s
      JOIN puzzles p ON s.puzzle_id = p.id
      WHERE p.level = ?
      ORDER BY s.team_id, p.puzzle_number, s.submitted_at DESC
    `, [levelId]);
    
    let evaluatedCount = 0;
    let correctCount = 0;
    const teamScores = {};
    const teamStats = {};
    
    // Process each submission
    for (const submission of pendingSubmissions) {
      const submittedTrimmed = (submission.submitted_answer || '').trim().toLowerCase();
      const correctTrimmed = (submission.correct_answer || '').trim().toLowerCase();
      const isCorrect = submittedTrimmed === correctTrimmed;
      
      const scoreAwarded = isCorrect ? submission.points : 0;
      
      await db.query(
        `UPDATE submissions 
         SET is_correct = ?,
             evaluation_status = 'EVALUATED',
             score_awarded = ?,
             evaluated_at = NOW()
         WHERE id = ?`,
        [isCorrect, scoreAwarded, submission.id]
      );
      
      if (!teamScores[submission.team_id]) {
        teamScores[submission.team_id] = 0;
        teamStats[submission.team_id] = {
          questionsAnswered: 0,
          questionsCorrect: 0,
          hintsUsed: 0,
          timeTaken: 0
        };
      }
      
      teamScores[submission.team_id] += scoreAwarded;
      teamStats[submission.team_id].questionsAnswered++;
      if (isCorrect) {
        teamStats[submission.team_id].questionsCorrect++;
        correctCount++;
      }
      teamStats[submission.team_id].timeTaken += submission.time_taken_seconds || 0;
      
      evaluatedCount++;
    }
    
    // Get all teams that have started this level
    const [teamLevelStatus] = await db.query('SELECT team_id FROM team_level_status WHERE level_id = ?', [levelId]);
    let allTeamIds = teamLevelStatus.map(t => t.team_id);

    // Add teams from submissions that might not have a team_level_status yet
    for (const teamId of Object.keys(teamScores)) {
      if (!allTeamIds.includes(teamId)) {
        allTeamIds.push(teamId);
      }
    }

    for (const teamId of allTeamIds) {
      const stats = teamStats[teamId] || {
        questionsAnswered: 0,
        questionsCorrect: 0,
        hintsUsed: 0,
        timeTaken: 0
      };
      const score = teamScores[teamId] || 0;
      const accuracy = stats.questionsAnswered > 0 
        ? ((stats.questionsCorrect / stats.questionsAnswered) * 100).toFixed(2)
        : 0;
      
      const [[hintsResult]] = await db.query(`
        SELECT SUM(tp.hints_used) as hints_used
        FROM team_progress tp
        JOIN puzzles p ON tp.puzzle_id = p.id
        WHERE tp.team_id = ? AND p.level = ?
      `, [teamId, levelId]);
      
      stats.hintsUsed = hintsResult?.hints_used || 0;
      
      const [existing] = await db.query(
        'SELECT id FROM team_level_status WHERE team_id = ? AND level_id = ?',
        [teamId, levelId]
      );
      
      if (existing.length > 0) {
        await db.query(
          `UPDATE team_level_status 
           SET score = ?,
               questions_answered = ?,
               questions_correct = ?,
               accuracy = ?,
               time_taken_seconds = ?,
               hints_used = ?,
               status = 'COMPLETED',
               completed_at = COALESCE(completed_at, NOW()),
               updated_at = NOW()
           WHERE team_id = ? AND level_id = ?`,
          [score, stats.questionsAnswered, stats.questionsCorrect, accuracy, 
           stats.timeTaken, stats.hintsUsed, teamId, levelId]
        );
      } else {
        const id = uuidv4();
        await db.query(
          `INSERT INTO team_level_status 
           (id, team_id, level_id, status, score, questions_answered, questions_correct,
            accuracy, time_taken_seconds, hints_used, completed_at)
           VALUES (?, ?, ?, 'COMPLETED', ?, ?, ?, ?, ?, ?, NOW())`,
          [id, teamId, levelId, score, stats.questionsAnswered, stats.questionsCorrect,
           accuracy, stats.timeTaken, stats.hintsUsed]
        );
      }
      
      try {
        await qualificationService.runAutoQualification(teamId, parseInt(levelId), {
          score,
          questionsAnswered: stats.questionsAnswered,
          questionsCorrect: stats.questionsCorrect,
          accuracy: parseFloat(accuracy),
          timeTaken: stats.timeTaken,
          hintsUsed: stats.hintsUsed
        });
      } catch (qualError) {
        console.error(`Error running qualification for team ${teamId}:`, qualError);
      }
    }
    
    await db.query(
      `UPDATE level_evaluation_state 
       SET evaluated_at = NOW(),
           updated_at = NOW()
       WHERE level_id = ?`,
      [levelId]
    );
    
    await logEvaluationAction(levelId, 'EVALUATION_COMPLETED', adminId, adminName, {
      teamsEvaluated: allTeamIds.length,
      submissionsEvaluated: evaluatedCount
    }, {
      correct_submissions: correctCount,
      total_submissions: evaluatedCount
    });
    
    res.json({
      success: true,
      message: `Evaluation completed for Level ${levelId}`,
      stats: {
        teams_evaluated: allTeamIds.length,
        submissions_evaluated: evaluatedCount,
        correct_answers: correctCount
      }
    });
  } catch (error) {
    console.error('Error evaluating answers:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to evaluate answers'
    });
  }
};

/**
 * POST /api/admin/level/:levelId/publish-results
 * Publish results - makes results visible to teams
 */
exports.publishResults = async (req, res) => {
  try {
    const { levelId } = req.params;
    const adminId = req.user.userId || req.user.id;
    const adminName = req.user.name || 'Admin';
    
    // Check current state
    const currentState = await getLevelEvaluationState(levelId);
    
    if (!currentState) {
      return res.status(400).json({
        success: false,
        message: 'Level evaluation state not initialized.'
      });
    }
    
    if (currentState.evaluation_state !== 'EVALUATING') {
      return res.status(400).json({
        success: false,
        message: `Cannot publish results. Current state: ${currentState.evaluation_state}. Must evaluate first.`
      });
    }
    
    // Check if evaluation actually completed
    if (!currentState.evaluated_at) {
      return res.status(400).json({
        success: false,
        message: 'Evaluation not completed. Please wait for evaluation to finish.'
      });
    }

    // ---- SUPABASE BRANCH ----
    if (USE_SUPABASE) {
      // Update state to RESULTS_PUBLISHED
      try {
        await supabaseAdmin.from('level_evaluation_state')
          .update({
            evaluation_state: 'RESULTS_PUBLISHED',
            results_published_at: new Date().toISOString(),
            published_by: adminId,
            updated_at: new Date().toISOString()
          })
          .eq('level_id', parseInt(levelId));
      } catch (e) {
        console.log('Error updating level_evaluation_state:', e.message);
      }

      // Mark results as visible for all teams
      try {
        await supabaseAdmin.from('team_level_status')
          .update({
            results_visible: true,
            updated_at: new Date().toISOString()
          })
          .eq('level_id', parseInt(levelId));
      } catch (e) {
        console.log('Error updating team_level_status:', e.message);
      }

      // Get qualification counts by fetching all rows and counting in JS
      let qualStats = { total: 0, qualified: 0, disqualified: 0 };
      try {
        const { data: rows } = await supabaseAdmin
          .from('team_level_status')
          .select('qualification_status')
          .eq('level_id', parseInt(levelId));
        const allRows = rows || [];
        qualStats = {
          total: allRows.length,
          qualified: allRows.filter(r => r.qualification_status === 'QUALIFIED').length,
          disqualified: allRows.filter(r => r.qualification_status === 'DISQUALIFIED').length
        };
      } catch (e) {
        console.log('Error fetching qualification stats:', e.message);
      }

      // Log action
      await logEvaluationAction(levelId, 'RESULTS_PUBLISHED', adminId, adminName, {
        teamsEvaluated: qualStats.total
      }, {
        qualified: qualStats.qualified,
        disqualified: qualStats.disqualified
      });

      return res.json({
        success: true,
        message: `Results published for Level ${levelId}`,
        stats: {
          total_teams: qualStats.total,
          qualified: qualStats.qualified,
          disqualified: qualStats.disqualified
        }
      });
    }

    // ---- MYSQL FALLBACK ----
    await db.query(
      `UPDATE level_evaluation_state 
       SET evaluation_state = 'RESULTS_PUBLISHED',
           results_published_at = NOW(),
           published_by = ?,
           updated_at = NOW()
       WHERE level_id = ?`,
      [adminId, levelId]
    );
    
    await db.query(
      `UPDATE team_level_status 
       SET results_visible = true, updated_at = NOW()
       WHERE level_id = ?`,
      [levelId]
    );
    
    const [qualStats] = await db.query(`
      SELECT 
        COUNT(*) as total,
        SUM(CASE WHEN qualification_status = 'QUALIFIED' THEN 1 ELSE 0 END) as qualified,
        SUM(CASE WHEN qualification_status = 'DISQUALIFIED' THEN 1 ELSE 0 END) as disqualified
      FROM team_level_status
      WHERE level_id = ?
    `, [levelId]);
    
    await logEvaluationAction(levelId, 'RESULTS_PUBLISHED', adminId, adminName, {
      teamsEvaluated: qualStats[0]?.total || 0
    }, {
      qualified: qualStats[0]?.qualified || 0,
      disqualified: qualStats[0]?.disqualified || 0
    });
    
    res.json({
      success: true,
      message: `Results published for Level ${levelId}`,
      stats: {
        total_teams: qualStats[0]?.total || 0,
        qualified: qualStats[0]?.qualified || 0,
        disqualified: qualStats[0]?.disqualified || 0
      }
    });
  } catch (error) {
    console.error('Error publishing results:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to publish results'
    });
  }
};

/**
 * POST /api/admin/level/:levelId/reopen-submissions
 * Reopen submissions (admin override) - allows teams to submit again
 * Only works if not yet evaluated
 */
exports.reopenSubmissions = async (req, res) => {
  try {
    const { levelId } = req.params;
    const adminId = req.user.userId || req.user.id;
    const adminName = req.user.name || 'Admin';
    
    const currentState = await getLevelEvaluationState(levelId);
    
    if (!currentState) {
      return res.status(400).json({
        success: false,
        message: 'Level evaluation state not initialized.'
      });
    }
    
    // Allow reopening from any state except IN_PROGRESS (already open)
    if (currentState.evaluation_state === 'IN_PROGRESS') {
      return res.status(400).json({
        success: false,
        message: 'Submissions are already open.'
      });
    }

    // ---- SUPABASE BRANCH ----
    if (USE_SUPABASE) {
      // Get puzzles for this level to reset submissions if needed
      let puzzleIds = [];
      try {
        const { data: puzzles } = await supabaseAdmin
          .from('puzzles').select('id').eq('level', parseInt(levelId));
        puzzleIds = (puzzles || []).map(p => p.id);
      } catch (e) {
        console.log('Error fetching puzzles:', e.message);
      }

      // If we're reopening from EVALUATING or RESULTS_PUBLISHED, reset submissions to PENDING
      if (currentState.evaluation_state === 'EVALUATING' || currentState.evaluation_state === 'RESULTS_PUBLISHED') {
        if (puzzleIds.length > 0) {
          try {
            // FIX: Don't set is_correct to null - column is BOOLEAN NOT NULL
            // Keep the original is_correct value from submission time
            await supabaseAdmin.from('submissions')
              .update({
                evaluation_status: 'PENDING',
                score_awarded: null,
                evaluated_at: null
              })
              .in('puzzle_id', puzzleIds);
          } catch (e) {
            console.log('Error resetting submissions:', e.message);
          }
        }

        // Reset team qualification status
        try {
          await supabaseAdmin.from('team_level_status')
            .update({
              qualification_status: 'PENDING',
              qualification_decided_at: null,
              results_visible: false,
              was_manually_overridden: false,
              override_by: null,
              override_reason: null,
              updated_at: new Date().toISOString()
            })
            .eq('level_id', parseInt(levelId));
        } catch (e) {
          console.log('Error resetting team_level_status:', e.message);
        }
      }

      try {
        await supabaseAdmin.from('level_evaluation_state')
          .update({
            evaluation_state: 'IN_PROGRESS',
            submissions_closed_at: null,
            closed_by: null,
            evaluation_started_at: null,
            evaluated_at: null,
            evaluated_by: null,
            results_published_at: null,
            published_by: null,
            updated_at: new Date().toISOString()
          })
          .eq('level_id', parseInt(levelId));
      } catch (e) {
        console.log('Error updating level_evaluation_state:', e.message);
      }

      await logEvaluationAction(levelId, 'SUBMISSIONS_REOPENED', adminId, adminName);

      return res.json({
        success: true,
        message: `Submissions reopened for Level ${levelId}`
      });
    }

    // ---- MYSQL FALLBACK ----
    // If we're reopening from EVALUATING or RESULTS_PUBLISHED, reset submissions
    if (currentState.evaluation_state === 'EVALUATING' || currentState.evaluation_state === 'RESULTS_PUBLISHED') {
      const [puzzles] = await db.query('SELECT id FROM puzzles WHERE level = ?', [levelId]);
      const puzzleIds = puzzles.map(p => p.id);

      if (puzzleIds.length > 0) {
        await db.query(
          `UPDATE submissions
           SET evaluation_status = 'PENDING',
               score_awarded = NULL,
               evaluated_at = NULL
           WHERE puzzle_id IN (?)`,
          [puzzleIds]
        );
      }

      await db.query(
        `UPDATE team_level_status
         SET qualification_status = 'PENDING',
             qualification_decided_at = NULL,
             results_visible = false,
             was_manually_overridden = false,
             override_by = NULL,
             override_reason = NULL,
             updated_at = NOW()
         WHERE level_id = ?`,
        [levelId]
      );
    }

    await db.query(
      `UPDATE level_evaluation_state 
       SET evaluation_state = 'IN_PROGRESS',
           submissions_closed_at = NULL,
           closed_by = NULL,
           evaluation_started_at = NULL,
           evaluated_at = NULL,
           evaluated_by = NULL,
           results_published_at = NULL,
           published_by = NULL,
           updated_at = NOW()
       WHERE level_id = ?`,
      [levelId]
    );
    
    await logEvaluationAction(levelId, 'SUBMISSIONS_REOPENED', adminId, adminName);
    
    res.json({
      success: true,
      message: `Submissions reopened for Level ${levelId}`
    });
  } catch (error) {
    console.error('Error reopening submissions:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to reopen submissions'
    });
  }
};

/**
 * POST /api/admin/level/:levelId/reset-evaluation
 * Reset evaluation state to allow re-evaluation
 * Works from any state - resets submissions to PENDING and state to SUBMISSIONS_CLOSED
 */
exports.resetEvaluation = async (req, res) => {
  try {
    const { levelId } = req.params;
    const adminId = req.user.userId || req.user.id;
    const adminName = req.user.name || 'Admin';
    
    const currentState = await getLevelEvaluationState(levelId);
    
    if (!currentState) {
      return res.status(400).json({
        success: false,
        message: 'Level evaluation state not initialized.'
      });
    }

    // ---- SUPABASE BRANCH ----
    if (USE_SUPABASE) {
      // Get puzzles for this level
      let puzzleIds = [];
      try {
        const { data: puzzles } = await supabaseAdmin
          .from('puzzles').select('id').eq('level', parseInt(levelId));
        puzzleIds = (puzzles || []).map(p => p.id);
      } catch (e) {
        console.log('Error fetching puzzles:', e.message);
      }

      // Reset all submissions for this level to PENDING
      if (puzzleIds.length > 0) {
        try {
          // FIX: Don't set is_correct to null - column is BOOLEAN NOT NULL
          // Keep the original is_correct value from submission time
          await supabaseAdmin.from('submissions')
            .update({
              evaluation_status: 'PENDING',
              score_awarded: null,
              evaluated_at: null
            })
            .in('puzzle_id', puzzleIds);
        } catch (e) {
          console.log('Error resetting submissions:', e.message);
        }
      }

      // Reset team_level_status qualification
      try {
        await supabaseAdmin.from('team_level_status')
          .update({
            qualification_status: 'PENDING',
            qualification_decided_at: null,
            results_visible: false,
            was_manually_overridden: false,
            override_by: null,
            override_reason: null,
            updated_at: new Date().toISOString()
          })
          .eq('level_id', parseInt(levelId));
      } catch (e) {
        console.log('Error resetting team_level_status:', e.message);
      }

      // Reset evaluation state to SUBMISSIONS_CLOSED
      try {
        await supabaseAdmin.from('level_evaluation_state')
          .update({
            evaluation_state: 'SUBMISSIONS_CLOSED',
            evaluation_started_at: null,
            evaluated_at: null,
            evaluated_by: null,
            results_published_at: null,
            published_by: null,
            updated_at: new Date().toISOString()
          })
          .eq('level_id', parseInt(levelId));
      } catch (e) {
        console.log('Error updating level_evaluation_state:', e.message);
      }

      await logEvaluationAction(levelId, 'EVALUATION_RESET', adminId, adminName);

      return res.json({
        success: true,
        message: `Evaluation reset for Level ${levelId}. You can now re-evaluate.`
      });
    }

    // ---- MYSQL FALLBACK ----
    // Get puzzles for this level
    const [puzzles] = await db.query('SELECT id FROM puzzles WHERE level = ?', [levelId]);
    const puzzleIds = puzzles.map(p => p.id);

    // Reset submissions
    if (puzzleIds.length > 0) {
      await db.query(
        `UPDATE submissions
         SET evaluation_status = 'PENDING',
             score_awarded = NULL,
             evaluated_at = NULL
         WHERE puzzle_id IN (?)`,
        [puzzleIds]
      );
    }

    // Reset team_level_status
    await db.query(
      `UPDATE team_level_status 
       SET qualification_status = 'PENDING',
           qualification_decided_at = NULL,
           results_visible = false,
           was_manually_overridden = false,
           override_by = NULL,
           override_reason = NULL,
           updated_at = NOW()
       WHERE level_id = ?`,
      [levelId]
    );

    // Reset evaluation state
    await db.query(
      `UPDATE level_evaluation_state 
       SET evaluation_state = 'SUBMISSIONS_CLOSED',
           evaluation_started_at = NULL,
           evaluated_at = NULL,
           evaluated_by = NULL,
           results_published_at = NULL,
           published_by = NULL,
           updated_at = NOW()
       WHERE level_id = ?`,
      [levelId]
    );
    
    await logEvaluationAction(levelId, 'EVALUATION_RESET', adminId, adminName);
    
    res.json({
      success: true,
      message: `Evaluation reset for Level ${levelId}. You can now re-evaluate.`
    });
  } catch (error) {
    console.error('Error resetting evaluation:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to reset evaluation'
    });
  }
};

// ============================================
// TEAM ENDPOINTS
// ============================================

/**
 * GET /api/team/level/:levelId/results
 * Get team's results for a level (only if published)
 */
exports.getTeamResults = async (req, res) => {
  try {
    const { levelId } = req.params;
    const teamId = req.user.team_id;
    
    if (!teamId) {
      return res.status(400).json({
        success: false,
        message: 'Team ID not found'
      });
    }

    // ---- SUPABASE BRANCH ----
    if (USE_SUPABASE) {
      // Check if results are published
      let evaluationState = null;
      try {
        const { data } = await supabaseAdmin
          .from('level_evaluation_state')
          .select('evaluation_state, results_published_at')
          .eq('level_id', parseInt(levelId));
        evaluationState = data?.[0] || null;
      } catch (e) {
        console.log('Error fetching level_evaluation_state:', e.message);
      }

      if (!evaluationState || evaluationState.evaluation_state !== 'RESULTS_PUBLISHED') {
        return res.json({
          success: true,
          results_available: false,
          message: 'Results are not published yet. Please wait for evaluation.'
        });
      }

      // Get team's level status
      let status = null;
      try {
        const { data } = await supabaseAdmin
          .from('team_level_status')
          .select('*')
          .eq('team_id', teamId)
          .eq('level_id', parseInt(levelId));
        status = data?.[0] || null;
      } catch (e) {
        console.log('Error fetching team_level_status:', e.message);
      }

      if (!status) {
        return res.json({
          success: true,
          results_available: false,
          message: 'No results found for your team in this level.'
        });
      }

      // Get puzzles for this level
      let puzzles = [];
      try {
        const { data } = await supabaseAdmin
          .from('puzzles')
          .select('id, puzzle_number, title, points, is_active')
          .eq('level', parseInt(levelId))
          .eq('is_active', true)
          .order('puzzle_number', { ascending: true });
        puzzles = data || [];
      } catch (e) {
        console.log('Error fetching puzzles:', e.message);
      }

      const puzzleIds = puzzles.map(p => p.id);
      const puzzleMap = {};
      for (const p of puzzles) {
        puzzleMap[p.id] = p;
      }

      // Get evaluated submissions for this team and level's puzzles
      let submissions = [];
      if (puzzleIds.length > 0) {
        try {
          const { data } = await supabaseAdmin
            .from('submissions')
            .select('id, submitted_answer, is_correct, score_awarded, time_taken_seconds, submitted_at, puzzle_id')
            .eq('team_id', teamId)
            .eq('evaluation_status', 'EVALUATED')
            .in('puzzle_id', puzzleIds)
            .order('submitted_at', { ascending: false });
          submissions = (data || []).map(s => ({
            ...s,
            puzzle_number: puzzleMap[s.puzzle_id]?.puzzle_number,
            puzzle_title: puzzleMap[s.puzzle_id]?.title,
            max_points: puzzleMap[s.puzzle_id]?.points
          }));
        } catch (e) {
          console.log('Error fetching submissions:', e.message);
        }
      }

      const answeredPuzzleNumbers = [...new Set(submissions.map(s => s.puzzle_number))];
      const skippedPuzzles = puzzles.filter(p => !answeredPuzzleNumbers.includes(p.puzzle_number));

      return res.json({
        success: true,
        results_available: true,
        results_published_at: evaluationState.results_published_at,
        level_id: parseInt(levelId),
        summary: {
          score: status.score,
          questions_answered: status.questions_answered,
          questions_correct: status.questions_correct,
          accuracy: status.accuracy,
          time_taken_seconds: status.time_taken_seconds,
          hints_used: status.hints_used,
          qualification_status: status.qualification_status
        },
        submissions: submissions,
        skipped_puzzles: skippedPuzzles,
        can_proceed_to_next_level: status.qualification_status === 'QUALIFIED'
      });
    }

    // ---- MYSQL FALLBACK ----
    const [state] = await db.query(
      'SELECT evaluation_state, results_published_at FROM level_evaluation_state WHERE level_id = ?',
      [levelId]
    );
    
    if (state.length === 0 || state[0].evaluation_state !== 'RESULTS_PUBLISHED') {
      return res.json({
        success: true,
        results_available: false,
        message: 'Results are not published yet. Please wait for evaluation.'
      });
    }
    
    const [teamStatus] = await db.query(
      `SELECT * FROM team_level_status WHERE team_id = ? AND level_id = ?`,
      [teamId, levelId]
    );
    
    if (teamStatus.length === 0) {
      return res.json({
        success: true,
        results_available: false,
        message: 'No results found for your team in this level.'
      });
    }
    
    const status = teamStatus[0];
    
    const [submissions] = await db.query(`
      SELECT 
        s.id,
        s.submitted_answer,
        s.is_correct,
        s.score_awarded,
        s.time_taken_seconds,
        s.submitted_at,
        p.puzzle_number,
        p.title as puzzle_title,
        p.points as max_points
      FROM submissions s
      JOIN puzzles p ON s.puzzle_id = p.id
      WHERE s.team_id = ? AND p.level = ? AND s.evaluation_status = 'EVALUATED'
      ORDER BY p.puzzle_number, s.submitted_at DESC
    `, [teamId, levelId]);
    
    const [allPuzzles] = await db.query(
      'SELECT id, puzzle_number, title, points FROM puzzles WHERE level = ? AND is_active = true ORDER BY puzzle_number',
      [levelId]
    );
    
    const answeredPuzzleNumbers = [...new Set(submissions.map(s => s.puzzle_number))];
    const skippedPuzzles = allPuzzles.filter(p => !answeredPuzzleNumbers.includes(p.puzzle_number));
    
    res.json({
      success: true,
      results_available: true,
      results_published_at: state[0].results_published_at,
      level_id: parseInt(levelId),
      summary: {
        score: status.score,
        questions_answered: status.questions_answered,
        questions_correct: status.questions_correct,
        accuracy: status.accuracy,
        time_taken_seconds: status.time_taken_seconds,
        hints_used: status.hints_used,
        qualification_status: status.qualification_status
      },
      submissions: submissions,
      skipped_puzzles: skippedPuzzles,
      can_proceed_to_next_level: status.qualification_status === 'QUALIFIED'
    });
  } catch (error) {
    console.error('Error getting team results:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get results'
    });
  }
};

/**
 * GET /api/team/level/:levelId/status
 * Get evaluation status for a level (for team waiting screen)
 */
exports.getTeamLevelEvaluationStatus = async (req, res) => {
  try {
    const { levelId } = req.params;
    const teamId = req.user.team_id;

    // ---- SUPABASE BRANCH ----
    if (USE_SUPABASE) {
      // Get evaluation state
      let evaluationState = 'IN_PROGRESS';
      try {
        const { data } = await supabaseAdmin
          .from('level_evaluation_state')
          .select('evaluation_state, results_published_at')
          .eq('level_id', parseInt(levelId));
        evaluationState = data?.[0]?.evaluation_state || 'IN_PROGRESS';
      } catch (e) {
        console.log('Error fetching level_evaluation_state:', e.message);
      }

      // Get team's submission count
      let submittedCount = 0;
      try {
        // Get puzzle IDs for this level
        const { data: puzzles } = await supabaseAdmin
          .from('puzzles')
          .select('id')
          .eq('level', parseInt(levelId));
        const puzzleIds = (puzzles || []).map(p => p.id);

        if (puzzleIds.length > 0) {
          const { data: subs } = await supabaseAdmin
            .from('submissions')
            .select('id')
            .eq('team_id', teamId)
            .in('puzzle_id', puzzleIds);
          submittedCount = (subs || []).length;
        }
      } catch (e) {
        console.log('Error fetching submission count:', e.message);
      }

      // Translate state to user-friendly message
      let statusMessage;
      switch (evaluationState) {
        case 'IN_PROGRESS':
          statusMessage = 'Submissions are open. You can still answer questions.';
          break;
        case 'SUBMISSIONS_CLOSED':
          statusMessage = 'Submissions are closed. Waiting for evaluation to begin.';
          break;
        case 'EVALUATING':
          statusMessage = 'Your answers are being evaluated. Please wait.';
          break;
        case 'RESULTS_PUBLISHED':
          statusMessage = 'Results are available! View your performance.';
          break;
        default:
          statusMessage = 'Unknown status';
      }

      return res.json({
        success: true,
        level_id: parseInt(levelId),
        evaluation_state: evaluationState,
        results_available: evaluationState === 'RESULTS_PUBLISHED',
        can_submit: evaluationState === 'IN_PROGRESS',
        submitted_answers: submittedCount,
        message: statusMessage
      });
    }

    // ---- MYSQL FALLBACK ----
    const [state] = await db.query(
      'SELECT evaluation_state, results_published_at FROM level_evaluation_state WHERE level_id = ?',
      [levelId]
    );
    
    const evaluationState = state[0]?.evaluation_state || 'IN_PROGRESS';
    
    const [[teamSubmissions]] = await db.query(`
      SELECT COUNT(*) as submitted_count
      FROM submissions s
      JOIN puzzles p ON s.puzzle_id = p.id
      WHERE s.team_id = ? AND p.level = ?
    `, [teamId, levelId]);
    
    let statusMessage;
    switch (evaluationState) {
      case 'IN_PROGRESS':
        statusMessage = 'Submissions are open. You can still answer questions.';
        break;
      case 'SUBMISSIONS_CLOSED':
        statusMessage = 'Submissions are closed. Waiting for evaluation to begin.';
        break;
      case 'EVALUATING':
        statusMessage = 'Your answers are being evaluated. Please wait.';
        break;
      case 'RESULTS_PUBLISHED':
        statusMessage = 'Results are available! View your performance.';
        break;
      default:
        statusMessage = 'Unknown status';
    }
    
    res.json({
      success: true,
      level_id: parseInt(levelId),
      evaluation_state: evaluationState,
      results_available: evaluationState === 'RESULTS_PUBLISHED',
      can_submit: evaluationState === 'IN_PROGRESS',
      submitted_answers: teamSubmissions?.submitted_count || 0,
      message: statusMessage
    });
  } catch (error) {
    console.error('Error getting team level evaluation status:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get status'
    });
  }
};

module.exports = {
  // Admin endpoints
  getEvaluationStatus: exports.getEvaluationStatus,
  closeSubmissions: exports.closeSubmissions,
  evaluateAnswers: exports.evaluateAnswers,
  publishResults: exports.publishResults,
  reopenSubmissions: exports.reopenSubmissions,
  resetEvaluation: exports.resetEvaluation,
  // Team endpoints
  getTeamResults: exports.getTeamResults,
  getTeamLevelEvaluationStatus: exports.getTeamLevelEvaluationStatus
};
