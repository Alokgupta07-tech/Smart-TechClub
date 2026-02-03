const db = require('../config/db');

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

    const [teams] = await db.query(`
      SELECT * FROM teams WHERE user_id = ?
    `, [userId]);

    if (teams.length === 0) {
      return res.status(404).json({ error: 'Team not found' });
    }

    const team = teams[0];
    
    // Convert to camelCase
    const formattedTeam = {
      id: team.id,
      teamName: team.team_name,
      level: team.level,
      status: team.status,
      progress: team.progress,
      startTime: team.start_time,
      endTime: team.end_time,
      hintsUsed: team.hints_used,
      timeElapsed: '00:00:00', // Will be calculated when event is active
      createdAt: team.created_at
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

    await db.query('UPDATE teams SET team_name = ? WHERE user_id = ?', [teamName, userId]);

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

    const [users] = await db.query(`
      SELECT id, name, email, role, is_verified, two_fa_enabled, created_at
      FROM users WHERE id = ?
    `, [userId]);

    if (users.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    res.json({ user: users[0] });
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

    await db.query('UPDATE users SET two_fa_enabled = ? WHERE id = ?', [enabled, userId]);

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
