const db = require('../config/db');
const { supabaseAdmin } = require('../config/supabase');
const { getAuditLogs, logAudit } = require('../services/auditService');
const { v4: uuidv4 } = require('uuid');

// Check if using Supabase
const USE_SUPABASE = process.env.USE_SUPABASE === 'true';

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
 * Helper to calculate time elapsed
 */
function calculateTimeElapsed(startTime, endTime) {
  if (!startTime) return { formatted: '00:00:00', seconds: 0 };
  const start = new Date(startTime);
  const end = endTime ? new Date(endTime) : new Date();
  const seconds = Math.floor((end - start) / 1000);
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;
  return {
    formatted: `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')}`,
    seconds
  };
}

/**
 * GET ALL TEAMS
 * GET /api/admin/teams
 * Includes team performance data for Level 1 qualification (8/10 correct = Qualified)
 */
async function getAllTeams(req, res) {
  try {
    // Level 1 has 10 questions - team qualifies if they answer 8+ correctly
    const LEVEL1_TOTAL_QUESTIONS = 10;
    const LEVEL1_QUALIFICATION_THRESHOLD = 8;

    let teams = [];

    if (USE_SUPABASE) {
      // Fetch teams with user data using Supabase
      const { data: teamsData, error: teamsError } = await supabaseAdmin
        .from('teams')
        .select(`
          id,
          team_name,
          level,
          status,
          progress,
          start_time,
          end_time,
          hints_used,
          created_at,
          user_id,
          users (
            name,
            email,
            is_verified
          )
        `);

      if (teamsError) throw teamsError;

      // Fetch submissions counts for all teams
      const { data: submissionsData, error: subError } = await supabaseAdmin
        .from('submissions')
        .select('team_id, is_correct');

      if (subError) throw subError;

      // Fetch completed puzzles count
      const { data: progressData, error: progError } = await supabaseAdmin
        .from('team_question_progress')
        .select('team_id, status');

      if (progError) throw progError;

      // Aggregate submission counts by team
      const submissionCounts = {};
      (submissionsData || []).forEach(s => {
        if (!submissionCounts[s.team_id]) {
          submissionCounts[s.team_id] = { total: 0, correct: 0, wrong: 0 };
        }
        submissionCounts[s.team_id].total++;
        if (s.is_correct) submissionCounts[s.team_id].correct++;
        else submissionCounts[s.team_id].wrong++;
      });

      // Aggregate completed puzzles by team
      const puzzleCounts = {};
      (progressData || []).forEach(p => {
        if (!puzzleCounts[p.team_id]) puzzleCounts[p.team_id] = 0;
        if (p.status === 'completed') puzzleCounts[p.team_id]++;
      });

      teams = (teamsData || []).map(t => {
        const timeData = calculateTimeElapsed(t.start_time, t.end_time);
        const counts = submissionCounts[t.id] || { total: 0, correct: 0, wrong: 0 };
        const isPerformanceQualified = counts.correct >= LEVEL1_QUALIFICATION_THRESHOLD;
        return {
          id: t.id,
          team_name: t.team_name,
          level: t.level,
          status: t.status,
          progress: t.progress,
          start_time: t.start_time,
          end_time: t.end_time,
          hints_used: t.hints_used,
          created_at: t.created_at,
          user_name: t.users?.name,
          user_email: t.users?.email,
          is_verified: t.users?.is_verified,
          time_elapsed: timeData.formatted,
          time_elapsed_seconds: timeData.seconds,
          qualified_for_level2: t.level >= 2 || isPerformanceQualified,
          level1_completed: t.level === 1 && t.progress >= 100,
          level2_completed: t.level === 2 && t.progress >= 100,
          completed_puzzles: puzzleCounts[t.id] || 0,
          total_submissions: counts.total,
          correct_answers: counts.correct,
          wrong_answers: counts.wrong
        };
      });

      // Sort by correct answers DESC, then time ASC
      teams.sort((a, b) => {
        if (b.correct_answers !== a.correct_answers) {
          return b.correct_answers - a.correct_answers;
        }
        return a.time_elapsed_seconds - b.time_elapsed_seconds;
      });
    } else {
      // MySQL fallback
      const [rows] = await db.query(`
        SELECT t.*, u.name as user_name, u.email as user_email, u.is_verified
        FROM teams t
        JOIN users u ON t.user_id = u.id
      `);
      teams = rows.map(t => {
        const timeData = calculateTimeElapsed(t.start_time, t.end_time);
        return { ...t, time_elapsed: timeData.formatted, time_elapsed_seconds: timeData.seconds };
      });
    }

    // Map to camelCase for frontend with qualification status
    const mappedTeams = teams.map(t => {
      const correctAnswers = t.correct_answers || 0;
      const wrongAnswers = t.wrong_answers || 0;
      const isQualified = correctAnswers >= LEVEL1_QUALIFICATION_THRESHOLD;
      
      return {
        id: t.id,
        teamName: t.team_name,
        level: t.level,
        status: t.status,
        progress: t.progress,
        startTime: t.start_time,
        endTime: t.end_time,
        hintsUsed: t.hints_used,
        timeElapsed: t.time_elapsed,
        timeElapsedSeconds: t.time_elapsed_seconds,
        createdAt: t.created_at,
        qualifiedForLevel2: t.qualified_for_level2,
        level1Completed: t.level1_completed,
        level2Completed: t.level2_completed,
        completedPuzzles: t.completed_puzzles || 0,
        totalSubmissions: t.total_submissions || 0,
        // Team Performance Data
        correctAnswers: correctAnswers,
        wrongAnswers: wrongAnswers,
        totalQuestions: LEVEL1_TOTAL_QUESTIONS,
        qualificationThreshold: LEVEL1_QUALIFICATION_THRESHOLD,
        qualificationStatus: isQualified ? 'qualified' : 'disqualified'
      };
    });

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

    if (USE_SUPABASE) {
      // Get team
      const { data: teamRow, error: teamError } = await supabaseAdmin
        .from('teams')
        .select('*')
        .eq('id', id)
        .single();

      if (teamError || !teamRow) {
        return res.status(404).json({ error: 'Team not found' });
      }

      // Get user info
      const { data: userData } = await supabaseAdmin
        .from('users')
        .select('id, name, email, is_verified, two_fa_enabled')
        .eq('id', teamRow.user_id)
        .single();

      // Calculate time elapsed
      const timeData = calculateTimeElapsed(teamRow.start_time, teamRow.end_time);

      // Fetch team members
      let members = [];
      try {
        const { data: membersData } = await supabaseAdmin
          .from('team_members')
          .select('name, email, phone, role')
          .eq('team_id', id)
          .order('created_at');
        members = membersData || [];
      } catch (e) {
        // team_members table may not exist
      }

      const result = {
        id: teamRow.id,
        teamName: teamRow.team_name,
        level: teamRow.level,
        status: teamRow.status,
        progress: teamRow.progress,
        startTime: teamRow.start_time,
        endTime: teamRow.end_time,
        hintsUsed: teamRow.hints_used,
        timeElapsed: timeData.formatted,
        createdAt: teamRow.created_at,
        members: members.length > 0 ? members : [
          {
            name: userData?.name,
            email: userData?.email,
            role: 'leader'
          }
        ]
      };

      return res.json(result);
    }

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

    if (USE_SUPABASE) {
      if (status === 'active') {
        const { error } = await supabaseAdmin
          .from('teams')
          .update({ status, start_time: new Date().toISOString() })
          .eq('id', id);
        if (error) throw error;
      } else {
        const { error } = await supabaseAdmin
          .from('teams')
          .update({ status })
          .eq('id', id);
        if (error) throw error;
      }
      return res.json({ message: 'Team status updated', status });
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

    if (USE_SUPABASE) {
      const { data, error } = await supabaseAdmin
        .from('teams')
        .select('team_name, user_id')
        .eq('id', id);

      if (error) throw error;
      if (!data || data.length === 0) {
        return res.status(404).json({ error: 'Team not found' });
      }

      const teamName = data[0].team_name;
      const userId = data[0].user_id;

      const { error: deleteError } = await supabaseAdmin
        .from('users')
        .delete()
        .eq('id', userId);

      if (deleteError) throw deleteError;

      await logAudit(req.user.userId, 'TEAM_DELETED', req, `Deleted team: ${teamName}`);
      return res.json({ message: 'Team deleted successfully' });
    }

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
    let totalTeams = 0, activeTeams = 0, completedTeams = 0, waitingTeams = 0, totalHints = 0, avgTime = '00:00:00';

    if (USE_SUPABASE) {
      // Fetch all teams at once
      const { data: teams, error } = await supabaseAdmin
        .from('teams')
        .select('status, hints_used, start_time, end_time');

      if (error) throw error;

      totalTeams = teams.length;
      activeTeams = teams.filter(t => t.status === 'active').length;
      completedTeams = teams.filter(t => t.status === 'completed').length;
      waitingTeams = teams.filter(t => t.status === 'waiting').length;
      totalHints = teams.reduce((sum, t) => sum + (t.hints_used || 0), 0);

      // Calculate average time for completed teams
      const completedWithTime = teams.filter(t => 
        t.status === 'completed' && t.start_time && t.end_time
      );
      
      if (completedWithTime.length > 0) {
        const totalSeconds = completedWithTime.reduce((sum, t) => {
          const start = new Date(t.start_time);
          const end = new Date(t.end_time);
          return sum + Math.floor((end - start) / 1000);
        }, 0);
        const avgSeconds = Math.floor(totalSeconds / completedWithTime.length);
        const hours = Math.floor(avgSeconds / 3600);
        const minutes = Math.floor((avgSeconds % 3600) / 60);
        const secs = avgSeconds % 60;
        avgTime = `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
      }
    } else {
      // MySQL fallback - single optimized query
      const [[stats]] = await db.query(`
        SELECT 
          COUNT(*) as total,
          SUM(CASE WHEN status = 'active' THEN 1 ELSE 0 END) as active,
          SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as completed,
          SUM(CASE WHEN status = 'waiting' THEN 1 ELSE 0 END) as waiting,
          COALESCE(SUM(hints_used), 0) as hints
        FROM teams
      `);
      totalTeams = stats.total;
      activeTeams = stats.active;
      completedTeams = stats.completed;
      waitingTeams = stats.waiting;
      totalHints = stats.hints || 0;
    }

    res.json({
      totalTeams,
      active: activeTeams,
      completed: completedTeams,
      waiting: waitingTeams,
      avgTime,
      hintsUsed: totalHints
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

    let alerts = [];

    if (USE_SUPABASE) {
      // Fetch audit logs with Supabase
      const { data: logs, error: logsError } = await supabaseAdmin
        .from('audit_logs')
        .select('id, user_id, action, details, created_at')
        .order('created_at', { ascending: false })
        .limit(limit);

      if (logsError) throw logsError;

      // Get unique user IDs
      const userIds = [...new Set((logs || []).map(l => l.user_id).filter(Boolean))];
      
      // Fetch users and teams
      let usersMap = {};
      let teamsMap = {};
      
      if (userIds.length > 0) {
        const { data: users } = await supabaseAdmin
          .from('users')
          .select('id, name, role')
          .in('id', userIds);
        
        (users || []).forEach(u => { usersMap[u.id] = u; });

        const { data: teams } = await supabaseAdmin
          .from('teams')
          .select('id, user_id, team_name')
          .in('user_id', userIds);
        
        (teams || []).forEach(t => { teamsMap[t.user_id] = t; });
      }

      alerts = (logs || []).map(log => {
        const user = usersMap[log.user_id];
        const team = teamsMap[log.user_id];
        return {
          id: log.id,
          teamId: team?.id || log.user_id || '',
          team: team?.team_name || user?.name || 'System',
          type: mapType(log.action),
          message: log.details || log.action || 'System event',
          createdAt: log.created_at,
        };
      });
    } else {
      // MySQL fallback
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

      alerts = rows.map((row) => ({
        id: row.id,
        teamId: row.team_id || row.user_id || '',
        team: row.team_name || row.user_name || 'System',
        type: mapType(row.action),
        message: row.details || row.action || 'System event',
        createdAt: row.created_at,
      }));
    }

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

    if (USE_SUPABASE) {
      if (action === 'reset') {
        const { error } = await supabaseAdmin
          .from('teams')
          .update({ status: 'waiting', level: 1, progress: 0, hints_used: 0, start_time: null, end_time: null })
          .eq('id', id);
        if (error) throw error;
      } else {
        const statusMap = {
          pause: 'waiting',
          resume: 'active',
          disqualify: 'disqualified',
        };
        const { error } = await supabaseAdmin
          .from('teams')
          .update({ status: statusMap[action] })
          .eq('id', id);
        if (error) throw error;
      }

      await logAudit(req.user?.userId || null, 'TEAM_ACTION', req, `Team ${id} -> ${action}`);
      return res.json({ message: 'Team action applied', action });
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
    // Simple query for teams - Supabase compatible
    const [teams] = await db.query(`SELECT id, team_name, level, progress, hints_used, status, start_time FROM teams`);
    
    // Get team progress counts separately
    let teamProgressData = [];
    let submissionsData = [];
    try {
      const [progressRows] = await db.query(`SELECT team_id, is_completed, current_puzzle FROM team_progress`);
      teamProgressData = progressRows || [];
    } catch (e) {
      // Table may not exist
    }
    
    try {
      const [submissionRows] = await db.query(`SELECT team_id FROM submissions`);
      submissionsData = submissionRows || [];
    } catch (e) {
      // Table may not exist
    }
    
    // Process data in JavaScript
    const now = new Date();
    const filteredTeams = (teams || []).filter(t => 
      ['waiting', 'active', 'paused', 'completed'].includes(t.status)
    );
    
    const mappedTeams = filteredTeams.map(team => {
      // Calculate elapsed seconds
      let elapsed_seconds = 0;
      if (team.start_time && team.status === 'active') {
        const startTime = new Date(team.start_time);
        elapsed_seconds = Math.floor((now - startTime) / 1000);
      }
      
      // Count completed puzzles
      const teamProgress = teamProgressData.filter(tp => tp.team_id === team.id);
      const completedPuzzles = teamProgress.filter(tp => tp.is_completed === true).length;
      const currentPuzzle = teamProgress.length > 0 
        ? teamProgress.sort((a, b) => (b.started_at || 0) - (a.started_at || 0))[0]?.current_puzzle || 1
        : 1;
      
      // Count total attempts
      const totalAttempts = submissionsData.filter(s => s.team_id === team.id).length;
      
      return {
        id: team.id,
        team_name: team.team_name,
        current_level: team.level,
        current_puzzle: currentPuzzle,
        progress: team.progress || 0,
        hints_used: team.hints_used || 0,
        status: team.status,
        start_time: team.start_time,
        elapsed_seconds: elapsed_seconds,
        completed_puzzles: completedPuzzles,
        total_attempts: totalAttempts
      };
    });
    
    // Sort by progress DESC, elapsed_seconds ASC
    mappedTeams.sort((a, b) => {
      if (b.progress !== a.progress) return b.progress - a.progress;
      return a.elapsed_seconds - b.elapsed_seconds;
    });
    
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
    
    // Simple queries - Supabase compatible
    let activityLogs = [];
    try {
      const [logs] = await db.query(`SELECT id, action_type, description, created_at, team_id, user_id FROM activity_logs ORDER BY created_at DESC`);
      activityLogs = logs || [];
    } catch (e) {
      // Table may not exist
      console.log('activity_logs table may not exist:', e.message);
    }
    
    // Filter by team if requested
    if (teamId) {
      activityLogs = activityLogs.filter(log => log.team_id === teamId);
    }
    
    // Limit results
    activityLogs = activityLogs.slice(0, limit);
    
    // Get teams and users for joining - parallel queries
    const [[teams], [users]] = await Promise.all([
      db.query(`SELECT id, team_name FROM teams`),
      db.query(`SELECT id, name FROM users`)
    ]);
    
    const teamsMap = new Map((teams || []).map(t => [t.id, t.team_name]));
    const usersMap = new Map((users || []).map(u => [u.id, u.name]));
    
    // Build joined result
    const logs = activityLogs.map(log => ({
      id: log.id,
      activity_type: log.action_type,
      description: log.description,
      timestamp: log.created_at,
      team_name: teamsMap.get(log.team_id) || null,
      user_name: usersMap.get(log.user_id) || null
    }));
    
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
    const now = new Date();
    const oneMinuteAgo = new Date(now - 60 * 1000);
    const fiveMinutesAgo = new Date(now - 5 * 60 * 1000);
    
    // Get recent submissions - Supabase compatible
    let submissions = [];
    try {
      const [rows] = await db.query(`SELECT team_id, submitted_at FROM submissions`);
      submissions = (rows || []).filter(s => new Date(s.submitted_at) > oneMinuteAgo);
    } catch (e) {
      // Table may not exist
    }
    
    // Get teams for joining
    const [teams] = await db.query(`SELECT id, team_name FROM teams`);
    const teamsMap = new Map((teams || []).map(t => [t.id, t.team_name]));
    
    // Calculate rapid submissions (>10 in last minute)
    const submissionCounts = {};
    submissions.forEach(s => {
      submissionCounts[s.team_id] = (submissionCounts[s.team_id] || { count: 0, lastSubmission: null });
      submissionCounts[s.team_id].count++;
      if (!submissionCounts[s.team_id].lastSubmission || new Date(s.submitted_at) > submissionCounts[s.team_id].lastSubmission) {
        submissionCounts[s.team_id].lastSubmission = new Date(s.submitted_at);
      }
    });
    
    const rapidSubmissions = Object.entries(submissionCounts)
      .filter(([_, data]) => data.count > 10)
      .map(([teamId, data]) => ({
        team_name: teamsMap.get(teamId) || 'Unknown',
        submission_count: data.count,
        last_submission: data.lastSubmission
      }));
    
    // Get tab switch events
    let tabSwitches = [];
    try {
      const [logs] = await db.query(`SELECT team_id, created_at FROM activity_logs WHERE action_type = 'tab_switch'`);
      const recentLogs = (logs || []).filter(l => new Date(l.created_at) > fiveMinutesAgo);
      
      // Calculate switch counts
      const switchCounts = {};
      recentLogs.forEach(log => {
        switchCounts[log.team_id] = (switchCounts[log.team_id] || { count: 0, lastSwitch: null });
        switchCounts[log.team_id].count++;
        if (!switchCounts[log.team_id].lastSwitch || new Date(log.created_at) > switchCounts[log.team_id].lastSwitch) {
          switchCounts[log.team_id].lastSwitch = new Date(log.created_at);
        }
      });
      
      tabSwitches = Object.entries(switchCounts)
        .filter(([_, data]) => data.count > 5)
        .map(([teamId, data]) => ({
          team_name: teamsMap.get(teamId) || 'Unknown',
          switch_count: data.count,
          last_switch: data.lastSwitch
        }));
    } catch (e) {
      // Table may not exist
    }
    
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
    // Simple query - Supabase compatible
    const [teams] = await db.query(`SELECT id, team_name, level, status, progress, hints_used, start_time, end_time FROM teams`);
    
    // Get team progress for completed counts
    let teamProgress = [];
    try {
      const [progress] = await db.query(`SELECT team_id, is_completed FROM team_progress`);
      teamProgress = progress || [];
    } catch (e) {
      // Table may not exist
    }
    
    // Process in JavaScript
    const processedTeams = (teams || []).map(team => {
      // Calculate total time in seconds
      let totalTimeSeconds = null;
      if (team.start_time && team.end_time) {
        const startTime = new Date(team.start_time);
        const endTime = new Date(team.end_time);
        totalTimeSeconds = Math.floor((endTime - startTime) / 1000);
      }
      
      // Count completed puzzles
      const completedPuzzles = teamProgress.filter(tp => tp.team_id === team.id && tp.is_completed === true).length;
      
      return {
        ...team,
        total_time_seconds: totalTimeSeconds,
        puzzles_completed: completedPuzzles
      };
    });
    
    // Sort: completed teams first, then by time, then by hints
    processedTeams.sort((a, b) => {
      // Status priority: completed=1, active=2, others=3
      const statusPriority = { 'completed': 1, 'active': 2 };
      const aPriority = statusPriority[a.status] || 3;
      const bPriority = statusPriority[b.status] || 3;
      
      if (aPriority !== bPriority) return aPriority - bPriority;
      
      // Then by time (shorter first)
      if (a.total_time_seconds !== b.total_time_seconds) {
        if (a.total_time_seconds === null) return 1;
        if (b.total_time_seconds === null) return -1;
        return a.total_time_seconds - b.total_time_seconds;
      }
      
      // Then by hints (fewer first)
      return (a.hints_used || 0) - (b.hints_used || 0);
    });
    
    // Convert to CSV
    const headers = [
      'Team Name', 'Level', 'Status', 'Progress %', 'Hints Used',
      'Total Time (seconds)', 'Puzzles Completed', 'Start Time', 'End Time'
    ];
    
    let csv = headers.join(',') + '\n';
    
    processedTeams.forEach(team => {
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

/**
 * QUALIFY TEAM FOR LEVEL 2
 * POST /api/admin/teams/:id/qualify-level2
 * Marks a team as qualified for Level 2 (finals)
 */
async function qualifyTeamForLevel2(req, res) {
  try {
    const { id } = req.params;

    if (USE_SUPABASE) {
      // Get team info
      const { data, error } = await supabaseAdmin
        .from('teams')
        .select('team_name, level, status')
        .eq('id', id);

      if (error) throw error;
      if (!data || data.length === 0) {
        return res.status(404).json({ error: 'Team not found' });
      }

      const team = data[0];

      // Update team to level 2 and reset progress
      const { error: updateError } = await supabaseAdmin
        .from('teams')
        .update({ level: 2, progress: 0, status: 'waiting' })
        .eq('id', id);

      if (updateError) throw updateError;

      // Create or update team level status record
      try {
        const { data: existing } = await supabaseAdmin
          .from('team_level_status')
          .select('id')
          .eq('team_id', id)
          .eq('level_id', 1);

        if (existing && existing.length > 0) {
          await supabaseAdmin
            .from('team_level_status')
            .update({ status: 'qualified', qualified_at: new Date().toISOString() })
            .eq('team_id', id)
            .eq('level_id', 1);
        } else {
          await supabaseAdmin
            .from('team_level_status')
            .insert({ id: uuidv4(), team_id: id, level_id: 1, status: 'qualified', qualified_at: new Date().toISOString() });
        }
      } catch (levelStatusError) {
        console.log('team_level_status table may not exist, continuing');
      }

      await logAudit(req.user.userId, 'TEAM_QUALIFIED_L2', req, `Qualified team "${team.team_name}" for Level 2`);

      return res.json({
        success: true,
        message: `Team "${team.team_name}" qualified for Level 2`,
        teamId: id,
        newLevel: 2
      });
    }

    // Get team info
    const [teams] = await db.query('SELECT team_name, level, status FROM teams WHERE id = ?', [id]);
    if (teams.length === 0) {
      return res.status(404).json({ error: 'Team not found' });
    }

    const team = teams[0];

    // Update team to level 2 and reset progress for new level
    await db.query(`
      UPDATE teams 
      SET level = 2,
          progress = 0,
          status = 'waiting'
      WHERE id = ?
    `, [id]);

    // Create or update team level status record
    try {
      await db.query(`
        INSERT INTO team_level_status (team_id, level_id, status, qualified_at)
        VALUES (?, 1, 'qualified', NOW())
        ON DUPLICATE KEY UPDATE status = 'qualified', qualified_at = NOW()
      `, [id]);
    } catch (levelStatusError) {
      console.log('team_level_status table may not exist, continuing');
    }

    // Log audit
    await logAudit(req.user.userId, 'TEAM_QUALIFIED_L2', req, `Qualified team "${team.team_name}" for Level 2`);

    res.json({ 
      success: true,
      message: `Team "${team.team_name}" qualified for Level 2`,
      teamId: id,
      newLevel: 2
    });
  } catch (error) {
    console.error('Qualify team for Level 2 error:', error);
    res.status(500).json({ error: 'Failed to qualify team for Level 2' });
  }
}

/**
 * GET TEAM MEMBERS
 * GET /api/admin/team-members
 * Returns all teams with their member lists
 */
async function getTeamMembers(req, res) {
  try {
    if (USE_SUPABASE) {
      // Fetch all teams with user (leader) info
      const { data: teamsData, error: teamsError } = await supabaseAdmin
        .from('teams')
        .select(`
          id,
          team_name,
          status,
          users (
            name,
            email
          )
        `)
        .order('created_at', { ascending: true });

      if (teamsError) throw teamsError;

      // Fetch all team_members
      let allMembers = [];
      try {
        const { data: membersData } = await supabaseAdmin
          .from('team_members')
          .select('id, team_id, member_name, member_email, member_role, is_leader, created_at')
          .order('created_at', { ascending: true });
        allMembers = membersData || [];
      } catch (e) {
        console.log('team_members table may not exist:', e.message);
      }

      // Group members by team
      const membersByTeam = {};
      allMembers.forEach(m => {
        if (!membersByTeam[m.team_id]) membersByTeam[m.team_id] = [];
        membersByTeam[m.team_id].push(m);
      });

      const teams = (teamsData || []).map(t => {
        const members = membersByTeam[t.id] || [];
        return {
          teamId: t.id,
          teamName: t.team_name,
          status: t.status,
          leader: t.users ? { name: t.users.name, email: t.users.email } : null,
          members,
          totalMembers: members.length
        };
      });

      const totalMembers = allMembers.length;
      return res.json({ teams, totalMembers, totalTeams: teams.length });
    }

    // MySQL fallback
    const [rows] = await db.query(`
      SELECT t.id as team_id, t.team_name, t.status,
             u.name as leader_name, u.email as leader_email,
             tm.id as member_id, tm.member_name, tm.member_email, tm.member_role, tm.is_leader, tm.created_at as member_created_at
      FROM teams t
      JOIN users u ON t.user_id = u.id
      LEFT JOIN team_members tm ON tm.team_id = t.id
      ORDER BY t.created_at, tm.created_at
    `);

    const teamsMap = {};
    rows.forEach(row => {
      if (!teamsMap[row.team_id]) {
        teamsMap[row.team_id] = {
          teamId: row.team_id,
          teamName: row.team_name,
          status: row.status,
          leader: { name: row.leader_name, email: row.leader_email },
          members: [],
          totalMembers: 0
        };
      }
      if (row.member_id) {
        teamsMap[row.team_id].members.push({
          id: row.member_id,
          member_name: row.member_name,
          member_email: row.member_email,
          member_role: row.member_role,
          is_leader: row.is_leader,
          created_at: row.member_created_at
        });
        teamsMap[row.team_id].totalMembers++;
      }
    });

    const teams = Object.values(teamsMap);
    const totalMembers = teams.reduce((sum, t) => sum + t.totalMembers, 0);
    res.json({ teams, totalMembers, totalTeams: teams.length });
  } catch (error) {
    console.error('Get team members error:', error);
    res.status(500).json({ error: 'Failed to fetch team members' });
  }
}

module.exports = {
  getAudit,
  getAllTeams,
  getTeamById,
  updateTeamStatus,
  qualifyTeamForLevel2,
  deleteTeam,
  getStats,
  getAlerts,
  teamAction,
  getLiveMonitoring,
  getActivityLogs,
  getSuspiciousActivity,
  exportResults,
  getTeamMembers
};
