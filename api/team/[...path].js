const { getPool } = require('../_lib/db');
const { verifyAuth, requireTeam, setCorsHeaders } = require('../_lib/auth');

/**
 * Team API - Serverless Handler
 * Handles: /api/team/*
 */

module.exports = async function handler(req, res) {
  setCorsHeaders(res);
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // Verify authentication
  const authResult = verifyAuth(req);
  if (authResult.error) {
    return res.status(authResult.status).json({ error: authResult.error, code: authResult.code });
  }

  const db = getPool();
  const path = req.url.replace('/api/team', '').split('?')[0];
  const user = authResult.user;

  try {
    // GET /api/team/me
    if (req.method === 'GET' && path === '/me') {
      const [teams] = await db.query(`
        SELECT t.*, u.name as leader_name, u.email as leader_email
        FROM teams t
        JOIN users u ON t.user_id = u.id
        WHERE t.user_id = ?
      `, [user.userId]);

      if (teams.length === 0) {
        return res.status(404).json({ error: 'Team not found' });
      }

      const [members] = await db.query('SELECT * FROM team_members WHERE team_id = ?', [teams[0].id]);

      return res.json({
        ...teams[0],
        members
      });
    }

    // GET /api/team/profile
    if (req.method === 'GET' && path === '/profile') {
      const [users] = await db.query('SELECT id, name, email, role, created_at FROM users WHERE id = ?', [user.userId]);
      if (users.length === 0) {
        return res.status(404).json({ error: 'User not found' });
      }
      return res.json(users[0]);
    }

    // PUT /api/team/name
    if (req.method === 'PUT' && path === '/name') {
      const { teamName } = req.body;

      if (!teamName) {
        return res.status(400).json({ error: 'Team name is required' });
      }

      await db.query('UPDATE teams SET team_name = ? WHERE user_id = ?', [teamName, user.userId]);
      return res.json({ message: 'Team name updated' });
    }

    return res.status(404).json({ error: 'Endpoint not found' });

  } catch (error) {
    console.error('Team API error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
};
