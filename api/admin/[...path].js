const { getSupabase } = require('../_lib/supabase');
const { verifyAuth, requireAdmin, setCorsHeaders } = require('../_lib/auth');

// Transform team row from snake_case DB to camelCase frontend
function mapTeam(t, usersMap) {
  var elapsed = '--:--:--';
  if (t.start_time) {
    var end = t.end_time ? new Date(t.end_time) : new Date();
    var diffSec = Math.floor((end - new Date(t.start_time)) / 1000);
    var h = Math.floor(diffSec / 3600);
    var m = Math.floor((diffSec % 3600) / 60);
    var s = diffSec % 60;
    elapsed = String(h).padStart(2, '0') + ':' + String(m).padStart(2, '0') + ':' + String(s).padStart(2, '0');
  }
  var leader = usersMap && usersMap[t.user_id] ? usersMap[t.user_id] : null;
  return {
    id: t.id,
    teamName: t.team_name || '',
    level: t.level || 1,
    status: t.status || 'waiting',
    progress: t.progress || 0,
    startTime: t.start_time || null,
    endTime: t.end_time || null,
    hintsUsed: t.hints_used || 0,
    timeElapsed: elapsed,
    createdAt: t.created_at || null,
    leader_name: leader ? leader.name : null,
    leader_email: leader ? leader.email : null,
    user_id: t.user_id
  };
}

module.exports = async function handler(req, res) {
  setCorsHeaders(res);
  if (req.method === 'OPTIONS') return res.status(200).end();

  const supabase = getSupabase();

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

  const path = req.url.replace('/api/admin', '').split('?')[0];

  try {
    // ─── GET /api/admin/teams ───
    if (req.method === 'GET' && path === '/teams') {
      const { data: teams, error: tErr } = await supabase
        .from('teams')
        .select('*')
        .order('created_at', { ascending: false });
      if (tErr) throw tErr;

      var userIds = [];
      (teams || []).forEach(function(t) {
        if (t.user_id && userIds.indexOf(t.user_id) === -1) userIds.push(t.user_id);
      });
      var usersMap = {};
      if (userIds.length > 0) {
        const { data: users } = await supabase
          .from('users')
          .select('id, name, email')
          .in('id', userIds);
        (users || []).forEach(function(u) { usersMap[u.id] = u; });
      }

      var result = (teams || []).map(function(t) { return mapTeam(t, usersMap); });
      return res.json(result);
    }

    // ─── GET /api/admin/teams/:id ───
    if (req.method === 'GET' && path.match(/^\/teams\/[^\/]+$/)) {
      var teamId = path.split('/')[2];

      const { data: team, error: tErr } = await supabase
        .from('teams')
        .select('*')
        .eq('id', teamId)
        .single();

      if (tErr || !team) {
        return res.status(404).json({ error: 'Team not found' });
      }

      const { data: leader } = await supabase
        .from('users')
        .select('name, email')
        .eq('id', team.user_id)
        .single();

      const { data: members } = await supabase
        .from('team_members')
        .select('*')
        .eq('team_id', teamId);

      var usMap = {};
      if (leader) usMap[team.user_id] = leader;
      var mapped = mapTeam(team, usMap);
      mapped.members = members || [];
      return res.json(mapped);
    }

    // ─── GET /api/admin/stats ───
    if (req.method === 'GET' && path === '/stats') {
      const { count: totalTeams } = await supabase
        .from('teams')
        .select('id', { count: 'exact', head: true });

      const { count: active } = await supabase
        .from('teams')
        .select('id', { count: 'exact', head: true })
        .eq('status', 'active');

      const { count: completed } = await supabase
        .from('teams')
        .select('id', { count: 'exact', head: true })
        .eq('status', 'completed');

      const { count: waiting } = await supabase
        .from('teams')
        .select('id', { count: 'exact', head: true })
        .eq('status', 'waiting');

      // Calculate avg time from completed teams
      const { data: completedTeams } = await supabase
        .from('teams')
        .select('start_time, end_time')
        .eq('status', 'completed')
        .not('start_time', 'is', null)
        .not('end_time', 'is', null);

      var avgTime = '00:00:00';
      if (completedTeams && completedTeams.length > 0) {
        var totalSec = 0;
        completedTeams.forEach(function(t) {
          totalSec += Math.floor((new Date(t.end_time) - new Date(t.start_time)) / 1000);
        });
        var avgSec = Math.floor(totalSec / completedTeams.length);
        var ah = Math.floor(avgSec / 3600);
        var am = Math.floor((avgSec % 3600) / 60);
        var as2 = avgSec % 60;
        avgTime = String(ah).padStart(2, '0') + ':' + String(am).padStart(2, '0') + ':' + String(as2).padStart(2, '0');
      }

      // Total hints used
      const { data: hintData } = await supabase
        .from('teams')
        .select('hints_used');
      var totalHints = 0;
      (hintData || []).forEach(function(t) { totalHints += (t.hints_used || 0); });

      return res.json({
        totalTeams: totalTeams || 0,
        active: active || 0,
        completed: completed || 0,
        waiting: waiting || 0,
        avgTime: avgTime,
        hintsUsed: totalHints
      });
    }

    // ─── GET /api/admin/alerts ───
    if (req.method === 'GET' && path === '/alerts') {
      // Try audit_logs table for alerts
      const { data: logs, error } = await supabase
        .from('audit_logs')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(20);

      if (error) {
        // If audit_logs doesn't exist, return empty array
        return res.json([]);
      }

      var alerts = (logs || []).map(function(log, idx) {
        var timeAgo = '';
        if (log.created_at) {
          var diffMs = Date.now() - new Date(log.created_at).getTime();
          var diffMin = Math.floor(diffMs / 60000);
          if (diffMin < 1) timeAgo = 'just now';
          else if (diffMin < 60) timeAgo = diffMin + 'm ago';
          else if (diffMin < 1440) timeAgo = Math.floor(diffMin / 60) + 'h ago';
          else timeAgo = Math.floor(diffMin / 1440) + 'd ago';
        }
        return {
          id: log.id || idx,
          teamId: log.team_id || '',
          team: log.team_name || log.action || 'System',
          type: log.action_type || log.severity || 'info',
          message: log.description || log.action || 'Activity logged',
          createdAt: log.created_at || '',
          timeAgo: timeAgo
        };
      });

      return res.json(alerts);
    }

    // ─── PUT /api/admin/teams/:id/status ───
    if (req.method === 'PUT' && path.match(/^\/teams\/[^\/]+\/status$/)) {
      var statusTeamId = path.split('/')[2];
      const { status } = req.body;

      const { error } = await supabase
        .from('teams')
        .update({ status: status })
        .eq('id', statusTeamId);
      if (error) throw error;

      return res.json({ message: 'Team status updated' });
    }

    // ─── DELETE /api/admin/teams/:id ───
    if (req.method === 'DELETE' && path.match(/^\/teams\/[^\/]+$/)) {
      var delTeamId = path.split('/')[2];

      // Delete team members first
      await supabase.from('team_members').delete().eq('team_id', delTeamId);

      // Delete the team (user cascade should handle the rest)
      const { data: team } = await supabase
        .from('teams')
        .select('user_id')
        .eq('id', delTeamId)
        .single();

      const { error } = await supabase.from('teams').delete().eq('id', delTeamId);
      if (error) throw error;

      // Also delete the user if found
      if (team && team.user_id) {
        await supabase.from('users').delete().eq('id', team.user_id);
      }

      return res.json({ message: 'Team deleted' });
    }

    // ─── PATCH /api/admin/team/:id/action ───
    if (req.method === 'PATCH' && path.match(/^\/team\/[^\/]+\/action$/)) {
      var actionTeamId = path.split('/')[2];
      const { action } = req.body;

      var statusMap = { pause: 'paused', resume: 'active', disqualify: 'disqualified' };
      var newStatus = statusMap[action];
      if (!newStatus) {
        return res.status(400).json({ error: 'Invalid action' });
      }

      const { error } = await supabase
        .from('teams')
        .update({ status: newStatus })
        .eq('id', actionTeamId);
      if (error) throw error;

      return res.json({ message: 'Team ' + action + ' successful' });
    }

    // ─── GET /api/admin/monitor/live ───
    if (req.method === 'GET' && path === '/monitor/live') {
      const { data: teams, error: tErr } = await supabase
        .from('teams')
        .select('id, team_name, current_level, total_score, status, user_id')
        .in('status', ['active', 'paused'])
        .order('total_score', { ascending: false });
      if (tErr) throw tErr;

      var liveUserIds = [];
      (teams || []).forEach(function(t) {
        if (t.user_id && liveUserIds.indexOf(t.user_id) === -1) liveUserIds.push(t.user_id);
      });
      var liveUsersMap = {};
      if (liveUserIds.length > 0) {
        const { data: users } = await supabase
          .from('users')
          .select('id, name')
          .in('id', liveUserIds);
        (users || []).forEach(function(u) { liveUsersMap[u.id] = u; });
      }

      var liveResult = (teams || []).map(function(t) {
        return {
          id: t.id,
          team_name: t.team_name,
          current_level: t.current_level,
          total_score: t.total_score,
          status: t.status,
          leader_name: liveUsersMap[t.user_id] ? liveUsersMap[t.user_id].name : null
        };
      });

      return res.json(liveResult);
    }

    // ─── GET /api/admin/activity ───
    if (req.method === 'GET' && path === '/activity') {
      const { data: logs, error } = await supabase
        .from('audit_logs')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(50);
      if (error) {
        return res.json([]);
      }
      return res.json(logs || []);
    }

    // ─── GET /api/admin/audit-logs ───
    if (req.method === 'GET' && path === '/audit-logs') {
      const { data: logs, error } = await supabase
        .from('audit_logs')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(100);
      if (error) {
        return res.json([]);
      }
      return res.json(logs || []);
    }

    return res.status(404).json({ error: 'Endpoint not found' });

  } catch (error) {
    console.error('Admin API error:', error);
    return res.status(500).json({ error: 'Internal server error', details: error.message });
  }
};
