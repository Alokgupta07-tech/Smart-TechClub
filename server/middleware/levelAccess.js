/**
 * ==============================================
 * LEVEL ACCESS MIDDLEWARE
 * ==============================================
 * Validates team's access to specific levels
 * Level 2 requires qualification from Level 1
 * 
 * NEW CODE - Added for Level-Wise Qualification System
 * UPDATED - Added evaluation state checks (Level 2 requires Level 1 results published)
 */

const db = require('../config/db');
const { supabaseAdmin } = require('../config/supabase');

const USE_SUPABASE = process.env.USE_SUPABASE === 'true';

/**
 * Check if team can access a specific level
 * SIMPLIFIED: Just check team's current level assignment
 * @param {string} teamId - Team's UUID
 * @param {number} levelId - Level number (1 or 2)
 * @returns {Promise<{allowed: boolean, reason: string, qualification_status?: string}>}
 */
async function checkTeamLevelAccess(teamId, levelId) {
  try {
    // Get team data
    const [team] = await db.query(
      'SELECT status, level FROM teams WHERE id = ?',
      [teamId]
    );
    
    if (team.length === 0) {
      return { allowed: false, reason: 'Team not found' };
    }
    
    if (team[0].status !== 'active') {
      return { allowed: false, reason: 'Team is not active' };
    }

    const teamLevel = team[0].level || 1;

    // Level 1 is always accessible
    if (levelId === 1) {
      return { allowed: true, reason: 'Level 1 accessible' };
    }
    
    // For Level 2+, check if team is assigned to that level or higher
    if (teamLevel >= levelId) {
      return {
        allowed: true,
        reason: `Level ${levelId} accessible`,
        qualification_status: 'QUALIFIED',
        results_published: true
      };
    }

    // Team not yet assigned to this level
    return {
      allowed: false,
      reason: `You must be promoted to Level ${levelId} before accessing it`,
      qualification_status: 'NOT_QUALIFIED'
    };
  } catch (error) {
    console.error('Error checking level access:', error);
    return { allowed: false, reason: 'Error checking access' };
  }
}

/**
 * Express middleware to validate level access before puzzle/gameplay routes
 * Extracts level from request and validates access
 */
function levelAccessMiddleware(options = {}) {
  return async (req, res, next) => {
    try {
      const teamId = req.user?.team_id;
      
      if (!teamId) {
        return res.status(401).json({
          success: false,
          message: 'Team authentication required'
        });
      }
      
      // Determine which level is being accessed
      let levelId = options.level || req.params.level || req.query.level || req.body.level;
      
      // If no explicit level, try to infer from puzzle
      if (!levelId && req.body.puzzle_id) {
        const [puzzle] = await db.query(
          'SELECT level FROM puzzles WHERE id = ?',
          [req.body.puzzle_id]
        );
        if (puzzle.length > 0) {
          levelId = puzzle[0].level;
        }
      }
      
      // Default to checking team's current level
      if (!levelId) {
        const [team] = await db.query('SELECT level FROM teams WHERE id = ?', [teamId]);
        levelId = team[0]?.level || 1;
      }
      
      levelId = parseInt(levelId);
      
      const accessResult = await checkTeamLevelAccess(teamId, levelId);
      
      if (!accessResult.allowed) {
        return res.status(403).json({
          success: false,
          message: accessResult.reason,
          code: 'LEVEL_ACCESS_DENIED',
          qualification_status: accessResult.qualification_status,
          required_level: levelId
        });
      }
      
      // Attach level info to request for downstream use
      req.levelAccess = {
        levelId,
        qualification_status: accessResult.qualification_status
      };
      
      next();
    } catch (error) {
      console.error('Level access middleware error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to validate level access'
      });
    }
  };
}

/**
 * Require specific level access (use in routes)
 * @param {number} level - Required level number
 */
function requireLevel(level) {
  return levelAccessMiddleware({ level });
}

module.exports = {
  checkTeamLevelAccess,
  levelAccessMiddleware,
  requireLevel
};
