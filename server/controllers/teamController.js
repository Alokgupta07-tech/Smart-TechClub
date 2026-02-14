const db = require('../config/db');
const { supabaseAdmin } = require('../config/supabase');
const USE_SUPABASE = process.env.USE_SUPABASE === 'true';

/**
 * TEAM CONTROLLER
 * Team-only endpoints
 */

/**
 * GET MY TEAM
 * GET /api/team/me
 */
async function getMyTeam(req, res) {
  try {
    const userId = req.user.userId;

    let team, gameStateRow;

    if (USE_SUPABASE) {
      // --- Supabase branch (parallel queries) ---
      const [teamResult, gameStateResult] = await Promise.all([
        supabaseAdmin
          .from('teams')
          .select('*')
          .eq('user_id', userId),
        supabaseAdmin
          .from('game_state')
          .select('level1_open, level2_open, game_started_at')
          .limit(1)
      ]);

      if (teamResult.error) throw teamResult.error;
      if (!teamResult.data || teamResult.data.length === 0) {
        return res.status(404).json({ error: 'Team not found' });
      }
      team = teamResult.data[0];

      if (gameStateResult.error) throw gameStateResult.error;
      // Normalize Supabase column names to match MySQL names
      if (gameStateResult.data && gameStateResult.data.length > 0) {
        const gs = gameStateResult.data[0];
        gameStateRow = {
          level_1_unlocked: gs.level1_open,
          level_2_unlocked: gs.level2_open,
          game_started_at: gs.game_started_at
        };
      } else {
        gameStateRow = null;
      }
    } else {
      // --- MySQL branch (parallel queries) ---
      const [teamsResult, gameStateQueryResult] = await Promise.all([
        db.query(`SELECT * FROM teams WHERE user_id = ?`, [userId]),
        db.query(`SELECT level_1_unlocked, level_2_unlocked, game_started_at FROM game_state LIMIT 1`)
      ]);

      const [teams] = teamsResult;
      const [gameState] = gameStateQueryResult;

      if (teams.length === 0) {
        return res.status(404).json({ error: 'Team not found' });
      }
      team = teams[0];
      gameStateRow = gameState && gameState.length > 0 ? gameState[0] : null;
    }

    // Calculate time elapsed if team has start_time
    let timeElapsed = '00:00:00';
    if (team.start_time) {
      const start = new Date(team.start_time);
      // Use end_time if completed, otherwise use current time
      const end = team.end_time ? new Date(team.end_time) : new Date();
      const diffMs = end - start;
      const hours = Math.floor(diffMs / 3600000);
      const minutes = Math.floor((diffMs % 3600000) / 60000);
      const seconds = Math.floor((diffMs % 60000) / 1000);
      timeElapsed = `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
    }

    // Determine qualification status
    const qualifiedForLevel2 = team.level >= 2;
    const level1Completed = team.progress >= 100 || team.level >= 2;
    const level2Unlocked = gameStateRow?.level_2_unlocked || false;
    const canStartLevel2 = qualifiedForLevel2 && level2Unlocked;

    // Convert to camelCase with enhanced data
    const formattedTeam = {
      id: team.id,
      teamName: team.team_name,
      level: team.level,
      status: team.status,
      progress: team.progress,
      startTime: team.start_time,
      endTime: team.end_time,
      hintsUsed: team.hints_used,
      timeElapsed: timeElapsed,
      createdAt: team.created_at,
      // Qualification status
      qualifiedForLevel2: qualifiedForLevel2,
      level1Completed: level1Completed,
      level2Unlocked: level2Unlocked,
      canStartLevel2: canStartLevel2,
      // Game state info
      gameState: {
        level1Unlocked: gameStateRow?.level_1_unlocked || false,
        level2Unlocked: gameStateRow?.level_2_unlocked || false,
        gameStartedAt: gameStateRow?.game_started_at || null
      }
    };

    res.json(formattedTeam);
  } catch (error) {
    console.error('Get my team error:', error);
    res.status(500).json({ error: 'Failed to fetch team' });
  }
}

/**
 * UPDATE TEAM NAME
 * PUT /api/team/name
 */
async function updateTeamName(req, res) {
  try {
    const userId = req.user.userId;
    const { teamName } = req.body;

    if (!teamName || teamName.length < 3) {
      return res.status(400).json({ error: 'Team name must be at least 3 characters' });
    }

    if (USE_SUPABASE) {
      const { error } = await supabaseAdmin
        .from('teams')
        .update({ team_name: teamName })
        .eq('user_id', userId);
      if (error) throw error;
    } else {
      await db.query('UPDATE teams SET team_name = ? WHERE user_id = ?', [teamName, userId]);
    }

    res.json({ message: 'Team name updated', teamName });
  } catch (error) {
    console.error('Update team name error:', error);
    res.status(500).json({ error: 'Failed to update team name' });
  }
}

/**
 * GET MY PROFILE
 * GET /api/team/profile
 */
async function getProfile(req, res) {
  try {
    const userId = req.user.userId;

    let user;

    if (USE_SUPABASE) {
      const { data, error } = await supabaseAdmin
        .from('users')
        .select('id, name, email, role, is_verified, two_fa_enabled, created_at')
        .eq('id', userId);
      if (error) throw error;
      if (!data || data.length === 0) {
        return res.status(404).json({ error: 'User not found' });
      }
      user = data[0];
    } else {
      const [users] = await db.query(`
        SELECT id, name, email, role, is_verified, two_fa_enabled, created_at
        FROM users WHERE id = ?
      `, [userId]);

      if (users.length === 0) {
        return res.status(404).json({ error: 'User not found' });
      }
      user = users[0];
    }

    res.json({ user });
  } catch (error) {
    console.error('Get profile error:', error);
    res.status(500).json({ error: 'Failed to fetch profile' });
  }
}

/**
 * ENABLE/DISABLE 2FA
 * POST /api/team/2fa
 */
async function toggle2FA(req, res) {
  try {
    const userId = req.user.userId;
    const { enabled } = req.body;

    if (typeof enabled !== 'boolean') {
      return res.status(400).json({ error: 'enabled must be true or false' });
    }

    if (USE_SUPABASE) {
      const { error } = await supabaseAdmin
        .from('users')
        .update({ two_fa_enabled: enabled })
        .eq('id', userId);
      if (error) throw error;
    } else {
      await db.query('UPDATE users SET two_fa_enabled = ? WHERE id = ?', [enabled, userId]);
    }

    res.json({ 
      message: `2FA ${enabled ? 'enabled' : 'disabled'}`, 
      twoFaEnabled: enabled 
    });
  } catch (error) {
    console.error('Toggle 2FA error:', error);
    res.status(500).json({ error: 'Failed to update 2FA setting' });
  }
}

module.exports = {
  getMyTeam,
  updateTeamName,
  getProfile,
  toggle2FA
};
