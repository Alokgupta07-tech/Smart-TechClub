/**
 * ==============================================
 * QUALIFICATION CONTROLLER
 * ==============================================
 * Handles API endpoints for level qualification system
 * 
 * NEW CODE - Added for Level-Wise Qualification System
 * UPDATED - Added evaluation state checks for result visibility
 */

const qualificationService = require('../services/qualificationService');
const { checkTeamLevelAccess } = require('../middleware/levelAccess');
const db = require('../config/db');
const { supabaseAdmin } = require('../config/supabase');
const USE_SUPABASE = process.env.USE_SUPABASE === 'true';

// ============================================
// HELPER FUNCTION
// ============================================

/**
 * Check if results are published for a level
 */
async function areResultsPublished(levelId) {
  if (USE_SUPABASE) {
    try {
      const { data } = await supabaseAdmin
        .from('level_evaluation_state')
        .select('evaluation_state')
        .eq('level_id', levelId);
      return data?.length > 0 && data[0].evaluation_state === 'RESULTS_PUBLISHED';
    } catch (e) {
      return false;
    }
  }

  const [state] = await db.query(
    'SELECT evaluation_state FROM level_evaluation_state WHERE level_id = ?',
    [levelId]
  );
  return state.length > 0 && state[0].evaluation_state === 'RESULTS_PUBLISHED';
}

// ============================================
// TEAM ENDPOINTS
// ============================================

/**
 * GET /api/team/level-status
 * Get team's current level and qualification status
 * 
 * UPDATED: Only returns qualification status if results are published
 */
exports.getTeamLevelStatus = async (req, res) => {
  try {
    const teamId = req.user.team_id;
    
    if (!teamId) {
      return res.status(400).json({
        success: false,
        message: 'Team ID not found'
      });
    }
    
    const levelStatus = await qualificationService.getTeamLevelStatus(teamId);
    
    let gameStateRow, evalStates;

    if (USE_SUPABASE) {
      // --- Supabase branch ---
      try {
        const { data: gsRows, error: gsErr } = await supabaseAdmin
          .from('game_state')
          .select('level2_open')
          .limit(1);
        if (gsErr) throw gsErr;
        // Normalize to MySQL column name
        gameStateRow = gsRows && gsRows.length > 0 ? { level_2_unlocked: gsRows[0].level2_open } : null;
      } catch (e) {
        console.error('Supabase game_state query error:', e);
        gameStateRow = null;
      }

      try {
        const { data: esRows, error: esErr } = await supabaseAdmin
          .from('level_evaluation_state')
          .select('level_id, evaluation_state, results_published_at');
        if (esErr) throw esErr;
        evalStates = esRows || [];
      } catch (e) {
        console.error('Supabase level_evaluation_state query error:', e);
        evalStates = [];
      }
    } else {
      // --- MySQL branch ---
      const [gameState] = await db.query('SELECT level_2_unlocked FROM game_state LIMIT 1');
      gameStateRow = gameState && gameState.length > 0 ? gameState[0] : null;

      const [esRows] = await db.query(
        'SELECT level_id, evaluation_state, results_published_at FROM level_evaluation_state'
      );
      evalStates = esRows || [];
    }

    const evalStateMap = {};
    evalStates.forEach(s => {
      evalStateMap[s.level_id] = s;
    });
    
    // Mask qualification status if results not published
    const maskedLevelStatus = { ...levelStatus };
    
    // If level 1 results not published, hide qualification
    if (maskedLevelStatus.level_1) {
      const l1Published = evalStateMap[1]?.evaluation_state === 'RESULTS_PUBLISHED';
      if (!l1Published) {
        maskedLevelStatus.level_1 = {
          ...maskedLevelStatus.level_1,
          qualification_status: 'AWAITING_EVALUATION',
          score: null,
          accuracy: null,
          questions_correct: null,
          results_message: 'Your answers have been submitted. Awaiting evaluation by admin.'
        };
      }
    }
    
    // If level 2 results not published, hide qualification
    if (maskedLevelStatus.level_2) {
      const l2Published = evalStateMap[2]?.evaluation_state === 'RESULTS_PUBLISHED';
      if (!l2Published) {
        maskedLevelStatus.level_2 = {
          ...maskedLevelStatus.level_2,
          qualification_status: 'AWAITING_EVALUATION',
          score: null,
          accuracy: null,
          questions_correct: null,
          results_message: 'Your answers have been submitted. Awaiting evaluation by admin.'
        };
      }
    }
    
    // Level 2 access: Only if Level 1 results published AND qualified
    const level1ResultsPublished = evalStateMap[1]?.evaluation_state === 'RESULTS_PUBLISHED';
    const level1QualificationStatus = levelStatus.level_1?.qualification_status;
    const canAccessLevel2 = level1ResultsPublished && 
                           level1QualificationStatus === 'QUALIFIED' &&
                           (gameStateRow?.level_2_unlocked || false);
    
    res.json({
      success: true,
      ...maskedLevelStatus,
      level_2_globally_unlocked: gameStateRow?.level_2_unlocked || false,
      level_1_results_published: level1ResultsPublished,
      can_access_level_2: canAccessLevel2,
      evaluation_states: evalStateMap
    });
  } catch (error) {
    console.error('Error getting team level status:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get level status'
    });
  }
};

/**
 * POST /api/team/level-complete
 * Called when team completes all puzzles in a level
 * Triggers auto-qualification check
 */
exports.completeLevel = async (req, res) => {
  try {
    const teamId = req.user.team_id;
    const { level_id } = req.body;
    
    if (!teamId || !level_id) {
      return res.status(400).json({
        success: false,
        message: 'Team ID and level_id are required'
      });
    }
    
    const result = await qualificationService.completeLevelAndQualify(teamId, level_id);
    
    res.json({
      success: true,
      ...result
    });
  } catch (error) {
    console.error('Error completing level:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to complete level'
    });
  }
};

/**
 * GET /api/team/qualification-message
 * Get qualification/disqualification messages for the team
 */
exports.getQualificationMessages = async (req, res) => {
  try {
    const teamId = req.user.team_id;
    const { unread_only } = req.query;
    
    if (!teamId) {
      return res.status(400).json({
        success: false,
        message: 'Team ID not found'
      });
    }
    
    const messages = await qualificationService.getQualificationMessages(
      teamId, 
      unread_only === 'true'
    );
    
    res.json({
      success: true,
      messages,
      unread_count: messages.filter(m => !m.is_read).length
    });
  } catch (error) {
    console.error('Error getting qualification messages:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get messages'
    });
  }
};

/**
 * POST /api/team/qualification-message/:id/read
 * Mark a message as read
 */
exports.markMessageRead = async (req, res) => {
  try {
    const teamId = req.user.team_id;
    const { id } = req.params;
    
    await qualificationService.markMessageRead(id, teamId);
    
    res.json({
      success: true,
      message: 'Message marked as read'
    });
  } catch (error) {
    console.error('Error marking message read:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to mark message read'
    });
  }
};

/**
 * POST /api/team/qualification-message/:id/dismiss
 * Dismiss a message (won't show again)
 */
exports.dismissMessage = async (req, res) => {
  try {
    const teamId = req.user.team_id;
    const { id } = req.params;
    
    await qualificationService.dismissMessage(id, teamId);
    
    res.json({
      success: true,
      message: 'Message dismissed'
    });
  } catch (error) {
    console.error('Error dismissing message:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to dismiss message'
    });
  }
};

/**
 * GET /api/team/can-access-level/:level
 * Check if team can access a specific level
 */
exports.checkLevelAccess = async (req, res) => {
  try {
    const teamId = req.user.team_id;
    const levelId = parseInt(req.params.level);
    
    if (!teamId || isNaN(levelId)) {
      return res.status(400).json({
        success: false,
        message: 'Team ID and level are required'
      });
    }
    
    const accessResult = await checkTeamLevelAccess(teamId, levelId);
    
    res.json({
      success: true,
      level: levelId,
      can_access: accessResult.allowed,
      reason: accessResult.reason,
      qualification_status: accessResult.qualification_status
    });
  } catch (error) {
    console.error('Error checking level access:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to check level access'
    });
  }
};

// ============================================
// ADMIN ENDPOINTS
// ============================================

/**
 * GET /api/admin/qualification/teams
 * Get all teams' qualification status
 */
exports.getAllTeamsQualification = async (req, res) => {
  try {
    const teams = await qualificationService.getAllTeamsQualificationStatus();
    
    res.json({
      success: true,
      teams,
      count: teams.length
    });
  } catch (error) {
    console.error('Error getting teams qualification:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get teams qualification status'
    });
  }
};

/**
 * POST /api/admin/team/qualification-override
 * Admin force qualify or disqualify a team
 */
exports.overrideQualification = async (req, res) => {
  try {
    const adminId = req.user.id;
    const { team_id, level_id, qualification_status, reason } = req.body;
    
    if (!team_id || !level_id || !qualification_status) {
      return res.status(400).json({
        success: false,
        message: 'team_id, level_id, and qualification_status are required'
      });
    }
    
    if (!['QUALIFIED', 'DISQUALIFIED'].includes(qualification_status)) {
      return res.status(400).json({
        success: false,
        message: 'qualification_status must be QUALIFIED or DISQUALIFIED'
      });
    }
    
    const result = await qualificationService.adminOverrideQualification(
      team_id,
      level_id,
      qualification_status,
      adminId,
      reason || 'Admin override'
    );
    
    res.json({
      success: true,
      ...result,
      message: `Team ${qualification_status.toLowerCase()} successfully`
    });
  } catch (error) {
    console.error('Error overriding qualification:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to override qualification'
    });
  }
};

/**
 * GET /api/admin/qualification/cutoffs
 * Get qualification cutoff configuration
 */
exports.getCutoffs = async (req, res) => {
  try {
    const { level_id } = req.query;
    const cutoffs = await qualificationService.getQualificationCutoffs(
      level_id ? parseInt(level_id) : null
    );
    
    res.json({
      success: true,
      cutoffs
    });
  } catch (error) {
    console.error('Error getting cutoffs:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get cutoffs'
    });
  }
};

/**
 * PUT /api/admin/qualification/cutoffs/:level
 * Update qualification cutoffs for a level
 */
exports.updateCutoffs = async (req, res) => {
  try {
    const adminId = req.user.id;
    const levelId = parseInt(req.params.level);
    const cutoffData = req.body;
    
    if (isNaN(levelId)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid level ID'
      });
    }
    
    await qualificationService.updateQualificationCutoffs(levelId, cutoffData, adminId);
    
    res.json({
      success: true,
      message: `Cutoffs for Level ${levelId} updated successfully`
    });
  } catch (error) {
    console.error('Error updating cutoffs:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update cutoffs'
    });
  }
};

/**
 * GET /api/admin/qualification/audit/:teamId
 * Get qualification audit log for a team
 */
exports.getTeamAuditLog = async (req, res) => {
  try {
    const { teamId } = req.params;

    if (USE_SUPABASE) {
      try {
        // --- Supabase branch: replace LEFT JOIN with two queries + JS merge ---
        const { data: logs, error: lErr } = await supabaseAdmin
          .from('qualification_audit_log')
          .select('*')
          .eq('team_id', teamId)
          .order('created_at', { ascending: false });

        if (lErr) throw lErr;

        // Collect unique performed_by IDs
        const adminIds = [...new Set(
          (logs || []).map(l => l.performed_by).filter(Boolean)
        )];

        let userMap = {};
        if (adminIds.length > 0) {
          const { data: users, error: uErr } = await supabaseAdmin
            .from('users')
            .select('id, name')
            .in('id', adminIds);
          if (uErr) throw uErr;
          (users || []).forEach(u => { userMap[u.id] = u.name; });
        }

        // Merge admin_name into logs
        const merged = (logs || []).map(l => ({
          ...l,
          admin_name: l.performed_by ? (userMap[l.performed_by] || null) : null
        }));

        return res.json({
          success: true,
          logs: merged
        });
      } catch (e) {
        // Table may not exist yet
        console.error('Supabase audit log query error:', e);
        return res.json({
          success: true,
          logs: []
        });
      }
    }

    // --- MySQL branch ---
    const [logs] = await db.query(
      `SELECT qal.*, u.name as admin_name
       FROM qualification_audit_log qal
       LEFT JOIN users u ON qal.performed_by = u.id
       WHERE qal.team_id = ?
       ORDER BY qal.created_at DESC`,
      [teamId]
    );

    res.json({
      success: true,
      logs
    });
  } catch (error) {
    console.error('Error getting audit log:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get audit log'
    });
  }
};
