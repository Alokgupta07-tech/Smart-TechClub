const db = require('../config/db');
const { getAuditLogs, logAudit } = require('../services/auditService');

/**
 * ADMIN CONTROLLER
 * Admin-only endpoints
 */

/**
 * GET AUDIT LOGS
 * GET /api/admin/audit-logs
 */
async function getAudit(req, res) {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 50;

    const result = await getAuditLogs(page, limit);

    res.json(result);
  } catch (error) {
    console.error('Get audit logs error:', error);
    res.status(500).json({ error: 'Failed to fetch audit logs' });
  }
}

/**
 * GET ALL TEAMS
 * GET /api/admin/teams
 */
async function getAllTeams(req, res) {
  try {
    const [teams] = await db.query(`
      SELECT 
        t.id,
        t.team_name,
        t.level,
        t.status,
        t.progress,
        t.start_time,
        t.end_time,
        t.hints_used,
        t.created_at,
        u.name as user_name,
        u.email as user_email,
        u.is_verified,
        CASE 
          WHEN t.start_time IS NOT NULL AND t.end_time IS NULL THEN
            SEC_TO_TIME(TIMESTAMPDIFF(SECOND, t.start_time, NOW()))
          WHEN t.start_time IS NOT NULL AND t.end_time IS NOT NULL THEN
            SEC_TO_TIME(TIMESTAMPDIFF(SECOND, t.start_time, t.end_time))
          ELSE '00:00:00'
        END AS time_elapsed
      FROM teams t
      JOIN users u ON t.user_id = u.id
      ORDER BY t.created_at DESC
    `);

    // Map to camelCase for frontend
    const mappedTeams = teams.map(t => ({
      id: t.id,
      teamName: t.team_name,
      level: t.level,
      status: t.status,
      progress: t.progress,
      startTime: t.start_time,
      endTime: t.end_time,
      hintsUsed: t.hints_used,
      timeElapsed: t.time_elapsed,
      createdAt: t.created_at
    }));

    res.json(mappedTeams);
  } catch (error) {
    console.error('Get all teams error:', error);
    res.status(500).json({ error: 'Failed to fetch teams' });
  }
}

/**
 * GET TEAM BY ID
 * GET /api/admin/teams/:id
 */
async function getTeamById(req, res) {
  try {
    const { id } = req.params;

    const [teams] = await db.query(`
      SELECT 
        t.id,
        t.team_name,
        t.level,
        t.status,
        t.progress,
        t.start_time,
        t.end_time,
        t.hints_used,
        t.created_at,
        u.id as user_id,
        u.name as user_name,
        u.email as user_email,
        u.is_verified,
        u.two_fa_enabled,
        CASE 
          WHEN t.start_time IS NOT NULL AND t.end_time IS NULL THEN
            SEC_TO_TIME(TIMESTAMPDIFF(SECOND, t.start_time, NOW()))
          WHEN t.start_time IS NOT NULL AND t.end_time IS NOT NULL THEN
            SEC_TO_TIME(TIMESTAMPDIFF(SECOND, t.start_time, t.end_time))
          ELSE '00:00:00'
        END AS time_elapsed
      FROM teams t
      JOIN users u ON t.user_id = u.id
      WHERE t.id = ?
    `, [id]);

    if (teams.length === 0) {
      return res.status(404).json({ error: 'Team not found' });
    }

    const team = teams[0];

    // Fetch team members
    const [members] = await db.query(`
      SELECT name, email, phone, role
      FROM team_members
      WHERE team_id = ?
      ORDER BY 
        CASE role 
          WHEN 'leader' THEN 1 
          ELSE 2 
        END,
        created_at
    `, [id]);

    // Map to camelCase and include member info
    const teamData = {
      id: team.id,
      teamName: team.team_name,
      level: team.level,
      status: team.status,
      progress: team.progress,
      startTime: team.start_time,
      endTime: team.end_time,
      hintsUsed: team.hints_used,
      timeElapsed: team.time_elapsed,
      createdAt: team.created_at,
      members: members.length > 0 ? members : [
        {
          name: team.user_name,
          email: team.user_email,
          role: 'leader'
        }
      ]
    };

    res.json(teamData);
  } catch (error) {
    console.error('Get team error:', error);
    res.status(500).json({ error: 'Failed to fetch team' });
  }
}

/**
 * UPDATE TEAM STATUS
 * PUT /api/admin/teams/:id/status
 */
async function updateTeamStatus(req, res) {
  try {
    const { id } = req.params;
    const { status } = req.body;

    const validStatuses = ['waiting', 'active', 'completed', 'disqualified'];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({ error: 'Invalid status' });
    }

    // If activating a team, also set start_time
    if (status === 'active') {
      await db.query('UPDATE teams SET status = ?, start_time = NOW() WHERE id = ?', [status, id]);
    } else if (status === 'waiting') {
      // If pausing/deactivating, keep start_time but clear end_time
      await db.query('UPDATE teams SET status = ? WHERE id = ?', [status, id]);
    } else {
      await db.query('UPDATE teams SET status = ? WHERE id = ?', [status, id]);
    }

    res.json({ message: 'Team status updated', status });
  } catch (error) {
    console.error('Update team status error:', error);
    res.status(500).json({ error: 'Failed to update team status' });
  }
}

/**
 * DELETE TEAM
 * DELETE /api/admin/teams/:id
 */
async function deleteTeam(req, res) {
  try {
    const { id } = req.params;

    // Get team info before deleting
    const [teams] = await db.query('SELECT team_name, user_id FROM teams WHERE id = ?', [id]);
    if (teams.length === 0) {
      return res.status(404).json({ error: 'Team not found' });
    }

    const teamName = teams[0].team_name;
    const userId = teams[0].user_id;

    // Delete team (will cascade delete user due to foreign key)
    await db.query('DELETE FROM users WHERE id = ?', [userId]);

    // Log audit
    await logAudit(req.user.userId, 'TEAM_DELETED', req, `Deleted team: ${teamName}`);

    res.json({ message: 'Team deleted successfully' });
  } catch (error) {
    console.error('Delete team error:', error);
    res.status(500).json({ error: 'Failed to delete team' });
  }
}

/**
 * GET SYSTEM STATS
 * GET /api/admin/stats
 */
async function getStats(req, res) {
  try {
    const [[{ totalTeams }]] = await db.query('SELECT COUNT(*) as totalTeams FROM teams');
    const [[{ activeTeams }]] = await db.query('SELECT COUNT(*) as activeTeams FROM teams WHERE status = "active"');
    const [[{ completedTeams }]] = await db.query('SELECT COUNT(*) as completedTeams FROM teams WHERE status = "completed"');
    const [[{ waitingTeams }]] = await db.query('SELECT COUNT(*) as waitingTeams FROM teams WHERE status = "waiting"');
    const [[{ totalHints }]] = await db.query('SELECT SUM(hints_used) as totalHints FROM teams');
    
    // Calculate average time for completed teams
    const [[{ avgTimeSeconds }]] = await db.query(`
      SELECT AVG(TIMESTAMPDIFF(SECOND, start_time, end_time)) as avgTimeSeconds
      FROM teams 
      WHERE status = 'completed' AND start_time IS NOT NULL AND end_time IS NOT NULL
    `);
    
    const avgTime = avgTimeSeconds 
      ? new Date(avgTimeSeconds * 1000).toISOString().substr(11, 8)
      : '00:00:00';

    res.json({
      totalTeams,
      active: activeTeams,
      completed: completedTeams,
      waiting: waitingTeams,
      avgTime,
      hintsUsed: totalHints || 0
    });
  } catch (error) {
    console.error('Get stats error:', error);
    res.status(500).json({ error: 'Failed to fetch stats' });
  }
}

/**
 * GET RECENT ALERTS
 * GET /api/admin/alerts
 * Maps audit logs to alert format used by frontend
 */
async function getAlerts(req, res) {
  try {
    const limit = parseInt(req.query.limit) || 50;

    const [rows] = await db.query(
      `SELECT 
         a.id,
         a.action,
         a.details,
         a.created_at,
         u.id AS user_id,
         u.name AS user_name,
         u.role AS user_role,
         t.id AS team_id,
         t.team_name AS team_name
       FROM audit_logs a
       LEFT JOIN users u ON a.user_id = u.id
       LEFT JOIN teams t ON t.user_id = u.id
       ORDER BY a.created_at DESC
       LIMIT ?`,
      [limit]
    );

    const mapType = (action) => {
      if (!action) return 'info';
      const upper = String(action).toUpperCase();
      if (upper.includes('FAILED') || upper.includes('INVALID')) return 'warning';
      if (upper.includes('DISQUALIFY') || upper.includes('LOCK')) return 'critical';
      if (upper.includes('VIOLATION')) return 'violation';
      if (upper.includes('TAB')) return 'tab_switch';
      if (upper.includes('COMPLETE')) return 'level_complete';
      return 'info';
    };

    const alerts = rows.map((row) => ({
      id: row.id,
      teamId: row.team_id || row.user_id || '',
      team: row.team_name || row.user_name || 'System',
      type: mapType(row.action),
      message: row.details || row.action || 'System event',
      createdAt: row.created_at,
    }));

    res.json(alerts);
  } catch (error) {
    console.error('Get alerts error:', error);
    res.status(500).json({ error: 'Failed to fetch alerts' });
  }
}

/**
 * TEAM ACTIONS
 * PATCH /api/admin/team/:id/action
 */
async function teamAction(req, res) {
  try {
    const { id } = req.params;
    const { action } = req.body;

    const validActions = ['pause', 'resume', 'disqualify', 'reset'];
    if (!validActions.includes(action)) {
      return res.status(400).json({ error: 'Invalid action' });
    }

    if (action === 'reset') {
      await db.query(
        'UPDATE teams SET status = ?, level = 1, progress = 0, hints_used = 0, start_time = NULL, end_time = NULL WHERE id = ?',
        ['waiting', id]
      );
    } else {
      const statusMap = {
        pause: 'waiting',
        resume: 'active',
        disqualify: 'disqualified',
      };

      await db.query('UPDATE teams SET status = ? WHERE id = ?', [statusMap[action], id]);
    }

    await logAudit(req.user?.userId || null, 'TEAM_ACTION', req, `Team ${id} -> ${action}`);

    res.json({ message: 'Team action applied', action });
  } catch (error) {
    console.error('Team action error:', error);
    res.status(500).json({ error: 'Failed to apply team action' });
  }
}

/**
 * GET LIVE MONITORING DATA
 * GET /api/admin/monitor/live
 */
async function getLiveMonitoring(req, res) {
  try {
    const [teams] = await db.query(`
      SELECT 
        t.id,
        t.team_name,
        t.level,
        t.progress,
        t.hints_used,
        t.status,
        t.start_time,
        CASE 
          WHEN t.start_time IS NOT NULL AND t.status = 'active' THEN
            TIMESTAMPDIFF(SECOND, t.start_time, NOW())
          ELSE 0
        END as elapsed_seconds,
        (SELECT COUNT(*) FROM team_progress tp WHERE tp.team_id = t.id AND tp.is_completed = true) as completed_puzzles,
        (SELECT COUNT(*) FROM submissions s WHERE s.team_id = t.id) as total_attempts,
        (SELECT tp2.current_puzzle FROM team_progress tp2 WHERE tp2.team_id = t.id ORDER BY tp2.started_at DESC LIMIT 1) as current_puzzle
      FROM teams t
      WHERE t.status IN ('waiting', 'active', 'paused', 'completed')
      ORDER BY t.progress DESC, elapsed_seconds ASC
    `);
    
    // Map to expected format
    const mappedTeams = teams.map(team => ({
      id: team.id,
      team_name: team.team_name,
      current_level: team.level,
      current_puzzle: team.current_puzzle || 1,
      progress: team.progress,
      hints_used: team.hints_used,
      status: team.status,
      start_time: team.start_time,
      elapsed_seconds: team.elapsed_seconds,
      completed_puzzles: team.completed_puzzles || 0,
      total_attempts: team.total_attempts || 0
    }));
    
    // Calculate stats from teams
    const stats = {
      total_teams: mappedTeams.length,
      active_teams: mappedTeams.filter(t => t.status === 'active').length,
      completed_teams: mappedTeams.filter(t => t.status === 'completed').length,
      average_progress: mappedTeams.length > 0 
        ? Math.round((mappedTeams.reduce((sum, t) => sum + (t.progress || 0), 0) / mappedTeams.length) * 10) / 10
        : 0
    };
    
    res.json({ success: true, teams: mappedTeams, stats });
  } catch (error) {
    console.error('Live monitoring error:', error);
    res.status(500).json({ error: 'Failed to fetch monitoring data' });
  }
}

/**
 * GET ACTIVITY LOGS
 * GET /api/admin/activity
 */
async function getActivityLogs(req, res) {
  try {
    const limit = parseInt(req.query.limit) || 100;
    const teamId = req.query.team_id;
    
    let query = `
      SELECT 
        al.id,
        al.action_type as activity_type,
        al.description,
        al.created_at as timestamp,
        t.team_name,
        u.name as user_name
      FROM activity_logs al
      LEFT JOIN teams t ON al.team_id = t.id
      LEFT JOIN users u ON al.user_id = u.id
    `;
    
    const params = [];
    if (teamId) {
      query += ' WHERE al.team_id = ?';
      params.push(teamId);
    }
    
    query += ' ORDER BY al.created_at DESC LIMIT ?';
    params.push(limit);
    
    const [logs] = await db.query(query, params);
    
    res.json({ success: true, logs });
  } catch (error) {
    console.error('Activity logs error:', error);
    res.status(500).json({ error: 'Failed to fetch activity logs' });
  }
}

/**
 * GET SUSPICIOUS ACTIVITY
 * GET /api/admin/suspicious
 */
async function getSuspiciousActivity(req, res) {
  try {
    // Multiple submissions in short time
    const [rapidSubmissions] = await db.query(`
      SELECT 
        t.team_name,
        COUNT(*) as submission_count,
        MAX(s.submitted_at) as last_submission
      FROM submissions s
      JOIN teams t ON s.team_id = t.id
      WHERE s.submitted_at > DATE_SUB(NOW(), INTERVAL 1 MINUTE)
      GROUP BY s.team_id
      HAVING submission_count > 10
    `);
    
    // Tab switch events
    const [tabSwitches] = await db.query(`
      SELECT 
        t.team_name,
        COUNT(*) as switch_count,
        MAX(al.created_at) as last_switch
      FROM activity_logs al
      JOIN teams t ON al.team_id = t.id
      WHERE al.action_type = 'tab_switch'
        AND al.created_at > DATE_SUB(NOW(), INTERVAL 5 MINUTE)
      GROUP BY al.team_id
      HAVING switch_count > 5
    `);
    
    res.json({
      success: true,
      alerts: {
        rapid_submissions: rapidSubmissions,
        excessive_tab_switches: tabSwitches
      }
    });
  } catch (error) {
    console.error('Suspicious activity error:', error);
    res.status(500).json({ error: 'Failed to fetch suspicious activity' });
  }
}

/**
 * EXPORT RESULTS (CSV)
 * GET /api/admin/export/results
 */
async function exportResults(req, res) {
  try {
    const [teams] = await db.query(`
      SELECT 
        t.team_name,
        t.level,
        t.status,
        t.progress,
        t.hints_used,
        CASE 
          WHEN t.start_time IS NOT NULL AND t.end_time IS NOT NULL THEN
            TIMESTAMPDIFF(SECOND, t.start_time, t.end_time)
          ELSE NULL
        END as total_time_seconds,
        (SELECT COUNT(*) FROM team_progress WHERE team_id = t.id AND is_completed = true) as puzzles_completed,
        t.start_time,
        t.end_time
      FROM teams t
      ORDER BY 
        CASE t.status
          WHEN 'completed' THEN 1
          WHEN 'active' THEN 2
          ELSE 3
        END,
        total_time_seconds ASC,
        t.hints_used ASC
    `);
    
    // Convert to CSV
    const headers = [
      'Team Name', 'Level', 'Status', 'Progress %', 'Hints Used',
      'Total Time (seconds)', 'Puzzles Completed', 'Start Time', 'End Time'
    ];
    
    let csv = headers.join(',') + '\n';
    
    teams.forEach(team => {
      const row = [
        `"${team.team_name}"`,
        team.level || 1,
        team.status,
        team.progress || 0,
        team.hints_used || 0,
        team.total_time_seconds || 'N/A',
        team.puzzles_completed || 0,
        team.start_time || 'N/A',
        team.end_time || 'N/A'
      ];
      csv += row.join(',') + '\n';
    });
    
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename=lockdown-hq-results.csv');
    res.send(csv);
  } catch (error) {
    console.error('Export error:', error);
    res.status(500).json({ error: 'Failed to export results' });
  }
}

module.exports = {
  getAudit,
  getAllTeams,
  getTeamById,
  updateTeamStatus,
  deleteTeam,
  getStats,
  getAlerts,
  teamAction,
  getLiveMonitoring,
  getActivityLogs,
  getSuspiciousActivity,
  exportResults
};
