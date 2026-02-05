/**
 * Time Tracking Controller
 * =========================
 * API endpoints for time tracking functionality
 * 
 * All endpoints require JWT authentication
 * Time validation is server-side only
 */

const timeTrackingService = require('../services/timeTrackingService');

/**
 * POST /api/game/start-question
 * Start timer for a question
 */
exports.startQuestion = async (req, res) => {
  try {
    const teamId = req.user.team_id;
    const { puzzle_id } = req.body;
    
    if (!teamId) {
      return res.status(400).json({
        success: false,
        message: 'Team ID not found in token'
      });
    }
    
    if (!puzzle_id) {
      return res.status(400).json({
        success: false,
        message: 'puzzle_id is required'
      });
    }
    
    const result = await timeTrackingService.startQuestion(teamId, puzzle_id, req);
    
    res.json(result);
  } catch (error) {
    console.error('Error starting question:', error);
    res.status(400).json({
      success: false,
      message: error.message || 'Failed to start question'
    });
  }
};

/**
 * POST /api/game/pause-question
 * Pause timer for current question
 */
exports.pauseQuestion = async (req, res) => {
  try {
    const teamId = req.user.team_id;
    const { puzzle_id } = req.body;
    
    if (!teamId) {
      return res.status(400).json({
        success: false,
        message: 'Team ID not found in token'
      });
    }
    
    if (!puzzle_id) {
      return res.status(400).json({
        success: false,
        message: 'puzzle_id is required'
      });
    }
    
    const result = await timeTrackingService.pauseQuestion(teamId, puzzle_id, req);
    
    res.json(result);
  } catch (error) {
    console.error('Error pausing question:', error);
    res.status(400).json({
      success: false,
      message: error.message || 'Failed to pause question'
    });
  }
};

/**
 * POST /api/game/resume-question
 * Resume timer for a paused question
 */
exports.resumeQuestion = async (req, res) => {
  try {
    const teamId = req.user.team_id;
    const { puzzle_id } = req.body;
    
    if (!teamId) {
      return res.status(400).json({
        success: false,
        message: 'Team ID not found in token'
      });
    }
    
    if (!puzzle_id) {
      return res.status(400).json({
        success: false,
        message: 'puzzle_id is required'
      });
    }
    
    const result = await timeTrackingService.resumeQuestion(teamId, puzzle_id, req);
    
    res.json(result);
  } catch (error) {
    console.error('Error resuming question:', error);
    res.status(400).json({
      success: false,
      message: error.message || 'Failed to resume question'
    });
  }
};

/**
 * POST /api/game/complete-question
 * Mark question as completed and stop timer
 */
exports.completeQuestion = async (req, res) => {
  try {
    const teamId = req.user.team_id;
    const { puzzle_id } = req.body;
    
    if (!teamId) {
      return res.status(400).json({
        success: false,
        message: 'Team ID not found in token'
      });
    }
    
    if (!puzzle_id) {
      return res.status(400).json({
        success: false,
        message: 'puzzle_id is required'
      });
    }
    
    const result = await timeTrackingService.completeQuestion(teamId, puzzle_id, req);
    
    res.json(result);
  } catch (error) {
    console.error('Error completing question:', error);
    res.status(400).json({
      success: false,
      message: error.message || 'Failed to complete question'
    });
  }
};

/**
 * POST /api/game/skip-question
 * Skip current question and apply penalty
 */
exports.skipQuestion = async (req, res) => {
  try {
    const teamId = req.user.team_id;
    const { puzzle_id } = req.body;
    
    if (!teamId) {
      return res.status(400).json({
        success: false,
        message: 'Team ID not found in token'
      });
    }
    
    if (!puzzle_id) {
      return res.status(400).json({
        success: false,
        message: 'puzzle_id is required'
      });
    }
    
    const result = await timeTrackingService.skipQuestion(teamId, puzzle_id, req);
    
    res.json(result);
  } catch (error) {
    console.error('Error skipping question:', error);
    res.status(400).json({
      success: false,
      message: error.message || 'Failed to skip question'
    });
  }
};

/**
 * POST /api/game/unskip-question
 * Return to a skipped question
 */
exports.unskipQuestion = async (req, res) => {
  try {
    const teamId = req.user.team_id;
    const { puzzle_id } = req.body;
    
    if (!teamId) {
      return res.status(400).json({
        success: false,
        message: 'Team ID not found in token'
      });
    }
    
    if (!puzzle_id) {
      return res.status(400).json({
        success: false,
        message: 'puzzle_id is required'
      });
    }
    
    const result = await timeTrackingService.unskipQuestion(teamId, puzzle_id, req);
    
    res.json(result);
  } catch (error) {
    console.error('Error unskipping question:', error);
    res.status(400).json({
      success: false,
      message: error.message || 'Failed to return to skipped question'
    });
  }
};

/**
 * POST /api/game/end-session
 * End team's game session
 */
exports.endSession = async (req, res) => {
  try {
    const teamId = req.user.team_id;
    
    if (!teamId) {
      return res.status(400).json({
        success: false,
        message: 'Team ID not found in token'
      });
    }
    
    const result = await timeTrackingService.endSession(teamId, req);
    
    res.json(result);
  } catch (error) {
    console.error('Error ending session:', error);
    res.status(400).json({
      success: false,
      message: error.message || 'Failed to end session'
    });
  }
};

/**
 * GET /api/game/timer/:puzzleId
 * Get current timer state for a question
 */
exports.getTimerState = async (req, res) => {
  try {
    const teamId = req.user.team_id;
    const { puzzleId } = req.params;
    
    if (!teamId) {
      return res.status(400).json({
        success: false,
        message: 'Team ID not found in token'
      });
    }
    
    const state = await timeTrackingService.getTimerState(teamId, puzzleId);
    
    res.json({
      success: true,
      timer: state
    });
  } catch (error) {
    console.error('Error getting timer state:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get timer state'
    });
  }
};

/**
 * GET /api/game/session
 * Get complete session state for team
 */
exports.getSessionState = async (req, res) => {
  try {
    const teamId = req.user.team_id;
    
    if (!teamId) {
      return res.status(400).json({
        success: false,
        message: 'Team ID not found in token'
      });
    }
    
    const state = await timeTrackingService.getSessionState(teamId);
    
    res.json({
      success: true,
      session: state
    });
  } catch (error) {
    console.error('Error getting session state:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get session state'
    });
  }
};

/**
 * POST /api/game/sync-timer
 * Sync timer with server (for reconnection/refresh)
 */
exports.syncTimer = async (req, res) => {
  try {
    const teamId = req.user.team_id;
    const { puzzle_id } = req.body;
    
    if (!teamId) {
      return res.status(400).json({
        success: false,
        message: 'Team ID not found in token'
      });
    }
    
    const state = await timeTrackingService.syncTimer(teamId, puzzle_id);
    
    res.json({
      success: true,
      ...state
    });
  } catch (error) {
    console.error('Error syncing timer:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to sync timer'
    });
  }
};

/**
 * GET /api/game/skipped-questions
 * Get list of skipped questions for current team
 */
exports.getSkippedQuestions = async (req, res) => {
  try {
    const teamId = req.user.team_id;
    
    if (!teamId) {
      return res.status(400).json({
        success: false,
        message: 'Team ID not found in token'
      });
    }
    
    const session = await timeTrackingService.getSessionState(teamId);
    const skippedQuestions = session.questions.filter(q => q.status === 'skipped');
    
    res.json({
      success: true,
      skipped_questions: skippedQuestions,
      total_skipped: skippedQuestions.length
    });
  } catch (error) {
    console.error('Error getting skipped questions:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get skipped questions'
    });
  }
};

// ============================================
// ADMIN ENDPOINTS
// ============================================

/**
 * GET /api/admin/team-timings
 * Get comprehensive timing data for all teams (Admin only)
 */
exports.getAdminTeamTimings = async (req, res) => {
  try {
    const data = await timeTrackingService.getAdminTeamTimings();
    
    res.json({
      success: true,
      ...data
    });
  } catch (error) {
    console.error('Error getting admin team timings:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get team timings'
    });
  }
};

/**
 * GET /api/admin/team-timings/:teamId
 * Get detailed timing for specific team (Admin only)
 */
exports.getTeamTimingDetails = async (req, res) => {
  try {
    const { teamId } = req.params;
    
    const session = await timeTrackingService.getSessionState(teamId);
    
    res.json({
      success: true,
      team_id: teamId,
      session
    });
  } catch (error) {
    console.error('Error getting team timing details:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get team timing details'
    });
  }
};

/**
 * GET /api/admin/game-settings
 * Get all game settings (Admin only)
 */
exports.getGameSettings = async (req, res) => {
  try {
    const settings = await timeTrackingService.getGameSettings();
    
    res.json({
      success: true,
      settings
    });
  } catch (error) {
    console.error('Error getting game settings:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get game settings'
    });
  }
};

/**
 * PUT /api/admin/game-settings/:key
 * Update a game setting (Admin only)
 */
exports.updateGameSetting = async (req, res) => {
  try {
    const { key } = req.params;
    const { value } = req.body;
    const adminId = req.user.id;
    
    if (value === undefined) {
      return res.status(400).json({
        success: false,
        message: 'value is required'
      });
    }
    
    const result = await timeTrackingService.updateGameSetting(key, value, adminId);
    
    res.json({
      success: true,
      ...result
    });
  } catch (error) {
    console.error('Error updating game setting:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update game setting'
    });
  }
};

/**
 * POST /api/admin/team/:teamId/end-session
 * Force end a team's session (Admin only)
 */
exports.adminEndTeamSession = async (req, res) => {
  try {
    const { teamId } = req.params;
    
    const result = await timeTrackingService.endSession(teamId, req);
    
    res.json({
      success: true,
      message: `Session ended for team ${teamId}`,
      ...result
    });
  } catch (error) {
    console.error('Error ending team session:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to end team session'
    });
  }
};

/**
 * POST /api/admin/team/:teamId/recalculate-time
 * Recalculate a team's effective time (Admin only)
 */
exports.recalculateTeamTime = async (req, res) => {
  try {
    const { teamId } = req.params;
    
    const result = await timeTrackingService.recalculateTeamEffectiveTime(teamId);
    
    res.json({
      success: true,
      team_id: teamId,
      ...result
    });
  } catch (error) {
    console.error('Error recalculating team time:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to recalculate team time'
    });
  }
};
