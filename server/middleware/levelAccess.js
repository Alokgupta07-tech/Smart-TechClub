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
 * @param {string} teamId - Team's UUID
 * @param {number} levelId - Level number (1 or 2)
 * @returns {Promise<{allowed: boolean, reason: string, qualification_status?: string}>}
 */
async function checkTeamLevelAccess(teamId, levelId) {
  try {
    // Level 1 is always accessible (if team is active)
    if (levelId === 1) {
      const [team] = await db.query(
        'SELECT status FROM teams WHERE id = ?',
        [teamId]
      );
      
      if (team.length === 0) {
        return { allowed: false, reason: 'Team not found' };
      }
      
      if (team[0].status !== 'active') {
        return { allowed: false, reason: 'Team is not active' };
      }
      
      return { allowed: true, reason: 'Level 1 accessible' };
    }
    
    // Level 2+ requires qualification from previous level
    if (levelId >= 2) {
      const previousLevel = levelId - 1;
      
      // ======= NEW: Check if previous level results are published =======
      const [evalState] = await db.query(
        'SELECT evaluation_state FROM level_evaluation_state WHERE level_id = ?',
        [previousLevel]
      );
      
      if (evalState.length === 0 || evalState[0].evaluation_state !== 'RESULTS_PUBLISHED') {
        return {
          allowed: false,
          reason: `Level ${previousLevel} results have not been published yet. Please wait for admin evaluation.`,
          qualification_status: 'AWAITING_RESULTS',
          results_published: false
        };
      }
      // ======= END NEW CODE =======
      
      // Check if team qualified previous level
      const [levelStatus] = await db.query(
        `SELECT qualification_status, status 
         FROM team_level_status 
         WHERE team_id = ? AND level_id = ?`,
        [teamId, previousLevel]
      );
      
      if (levelStatus.length === 0) {
        return {
          allowed: false,
          reason: `You must complete Level ${previousLevel} before accessing Level ${levelId}`,
          qualification_status: 'NOT_STARTED'
        };
      }
      
      const { qualification_status, status } = levelStatus[0];
      
      if (status !== 'COMPLETED') {
        return {
          allowed: false,
          reason: `You must complete Level ${previousLevel} before accessing Level ${levelId}`,
          qualification_status: qualification_status
        };
      }
      
      if (qualification_status !== 'QUALIFIED') {
        return {
          allowed: false,
          reason: `You must qualify Level ${previousLevel} to access Level ${levelId}`,
          qualification_status: qualification_status
        };
      }
      
      // Check if game state allows Level 2
      if (levelId === 2) {
        let level2Open = false;
        if (USE_SUPABASE) {
          try {
            const { data: gsRows } = await supabaseAdmin.from('game_state').select('level2_open').limit(1);
            level2Open = gsRows?.[0]?.level2_open || false;
          } catch (e) { /* ignore */ }
        } else {
          const [gameState] = await db.query('SELECT level_2_unlocked FROM game_state LIMIT 1');
          level2Open = gameState[0]?.level_2_unlocked || false;
        }
        if (!level2Open) {
          return {
            allowed: false,
            reason: 'Level 2 has not been unlocked by the admin yet',
            qualification_status: 'QUALIFIED'
          };
        }
      }
      
      return {
        allowed: true,
        reason: `Level ${levelId} accessible`,
        qualification_status: 'QUALIFIED',
        results_published: true
      };
    }
    
    return { allowed: false, reason: 'Invalid level' };
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
