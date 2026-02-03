const { getPool } = require('../_lib/db');
const { verifyAuth, requireAdmin, setCorsHeaders } = require('../_lib/auth');

/**
 * Admin API - Serverless Handler
 * Handles: /api/admin/*
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

  // Verify admin role
  const adminCheck = requireAdmin(authResult.user);
  if (adminCheck) {
    return res.status(adminCheck.status).json({ error: adminCheck.error });
  }

  const db = getPool();
  const path = req.url.replace('/api/admin', '').split('?')[0];

  try {
    // GET /api/admin/teams
    if (req.method === 'GET' && path === '/teams') {
      const [teams] = await db.query(`
        SELECT t.*, u.name as leader_name, u.email as leader_email
        FROM teams t
        JOIN users u ON t.user_id = u.id
        ORDER BY t.created_at DESC
      `);
      return res.json(teams);
    }

    // GET /api/admin/teams/:id
    if (req.method === 'GET' && path.match(/^\/teams\/[^\/]+$/)) {
      const teamId = path.split('/')[2];
      const [teams] = await db.query(`
        SELECT t.*, u.name as leader_name, u.email as leader_email
        FROM teams t
        JOIN users u ON t.user_id = u.id
        WHERE t.id = ?
      `, [teamId]);

      if (teams.length === 0) {
        return res.status(404).json({ error: 'Team not found' });
      }

      const [members] = await db.query('SELECT * FROM team_members WHERE team_id = ?', [teamId]);
      return res.json({ ...teams[0], members });
    }

    // GET /api/admin/stats
    if (req.method === 'GET' && path === '/stats') {
      const [totalTeams] = await db.query('SELECT COUNT(*) as count FROM teams');
      const [activeTeams] = await db.query("SELECT COUNT(*) as count FROM teams WHERE status = 'active'");
      const [completedTeams] = await db.query("SELECT COUNT(*) as count FROM teams WHERE status = 'completed'");

      return res.json({
        totalTeams: totalTeams[0].count,
        activeTeams: activeTeams[0].count,
        completedTeams: completedTeams[0].count
      });
    }

    // PUT /api/admin/teams/:id/status
    if (req.method === 'PUT' && path.match(/^\/teams\/[^\/]+\/status$/)) {
      const teamId = path.split('/')[2];
      const { status } = req.body;

      await db.query('UPDATE teams SET status = ? WHERE id = ?', [status, teamId]);
      return res.json({ message: 'Team status updated' });
    }

    // PATCH /api/admin/team/:id/action
    if (req.method === 'PATCH' && path.match(/^\/team\/[^\/]+\/action$/)) {
      const teamId = path.split('/')[2];
      const { action } = req.body;

      if (action === 'pause') {
        await db.query("UPDATE teams SET status = 'paused' WHERE id = ?", [teamId]);
      } else if (action === 'resume') {
        await db.query("UPDATE teams SET status = 'active' WHERE id = ?", [teamId]);
      } else if (action === 'disqualify') {
        await db.query("UPDATE teams SET status = 'disqualified' WHERE id = ?", [teamId]);
      }

      return res.json({ message: `Team ${action} successful` });
    }

    // GET /api/admin/monitor/live
    if (req.method === 'GET' && path === '/monitor/live') {
      const [teams] = await db.query(`
        SELECT t.id, t.team_name, t.current_level, t.total_score, t.status,
               u.name as leader_name
        FROM teams t
        JOIN users u ON t.user_id = u.id
        WHERE t.status IN ('active', 'paused')
        ORDER BY t.total_score DESC
      `);
      return res.json(teams);
    }

    // GET /api/admin/activity
    if (req.method === 'GET' && path === '/activity') {
      const [logs] = await db.query(`
        SELECT * FROM audit_logs 
        ORDER BY created_at DESC 
        LIMIT 50
      `);
      return res.json(logs);
    }

    // GET /api/admin/audit-logs
    if (req.method === 'GET' && path === '/audit-logs') {
      const [logs] = await db.query(`
        SELECT * FROM audit_logs 
        ORDER BY created_at DESC 
        LIMIT 100
      `);
      return res.json(logs);
    }

    return res.status(404).json({ error: 'Endpoint not found' });

  } catch (error) {
    console.error('Admin API error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
};
