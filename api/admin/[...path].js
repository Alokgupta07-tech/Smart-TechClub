const { getSupabase } = require('../_lib/supabase');
const { verifyAuth, requireAdmin, setCorsHeaders } = require('../_lib/auth');

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
      // Get teams
      const { data: teams, error: tErr } = await supabase
        .from('teams')
        .select('*')
        .order('created_at', { ascending: false });
      if (tErr) throw tErr;

      // Get leader info for each team
      const userIds = [...new Set((teams || []).map(t => t.user_id).filter(Boolean))];
      let usersMap = {};
      if (userIds.length > 0) {
        const { data: users } = await supabase
          .from('users')
          .select('id, name, email')
          .in('id', userIds);
        for (const u of (users || [])) usersMap[u.id] = u;
      }

      const result = (teams || []).map(t => ({
        ...t,
        leader_name: usersMap[t.user_id]?.name || null,
        leader_email: usersMap[t.user_id]?.email || null
      }));

      return res.json(result);
    }

    // ─── GET /api/admin/teams/:id ───
    if (req.method === 'GET' && path.match(/^\/teams\/[^\/]+$/)) {
      const teamId = path.split('/')[2];

      const { data: team, error: tErr } = await supabase
        .from('teams')
        .select('*')
        .eq('id', teamId)
        .single();

      if (tErr || !team) {
        return res.status(404).json({ error: 'Team not found' });
      }

      // Get leader info
      const { data: leader } = await supabase
        .from('users')
        .select('name, email')
        .eq('id', team.user_id)
        .single();

      // Get members
      const { data: members } = await supabase
        .from('team_members')
        .select('*')
        .eq('team_id', teamId);

      return res.json({
        ...team,
        leader_name: leader?.name || null,
        leader_email: leader?.email || null,
        members: members || []
      });
    }

    // ─── GET /api/admin/stats ───
    if (req.method === 'GET' && path === '/stats') {
      const { count: totalTeams } = await supabase
        .from('teams')
        .select('id', { count: 'exact', head: true });

      const { count: activeTeams } = await supabase
        .from('teams')
        .select('id', { count: 'exact', head: true })
        .eq('status', 'active');

      const { count: completedTeams } = await supabase
        .from('teams')
        .select('id', { count: 'exact', head: true })
        .eq('status', 'completed');

      return res.json({
        totalTeams: totalTeams || 0,
        activeTeams: activeTeams || 0,
        completedTeams: completedTeams || 0
      });
    }

    // ─── PUT /api/admin/teams/:id/status ───
    if (req.method === 'PUT' && path.match(/^\/teams\/[^\/]+\/status$/)) {
      const teamId = path.split('/')[2];
      const { status } = req.body;

      const { error } = await supabase
        .from('teams')
        .update({ status })
        .eq('id', teamId);
      if (error) throw error;

      return res.json({ message: 'Team status updated' });
    }

    // ─── PATCH /api/admin/team/:id/action ───
    if (req.method === 'PATCH' && path.match(/^\/team\/[^\/]+\/action$/)) {
      const teamId = path.split('/')[2];
      const { action } = req.body;

      const statusMap = { pause: 'paused', resume: 'active', disqualify: 'disqualified' };
      const newStatus = statusMap[action];
      if (!newStatus) {
        return res.status(400).json({ error: 'Invalid action' });
      }

      const { error } = await supabase
        .from('teams')
        .update({ status: newStatus })
        .eq('id', teamId);
      if (error) throw error;

      return res.json({ message: `Team ${action} successful` });
    }

    // ─── GET /api/admin/monitor/live ───
    if (req.method === 'GET' && path === '/monitor/live') {
      const { data: teams, error: tErr } = await supabase
        .from('teams')
        .select('id, team_name, current_level, total_score, status, user_id')
        .in('status', ['active', 'paused'])
        .order('total_score', { ascending: false });
      if (tErr) throw tErr;

      // Get leader names
      const userIds = [...new Set((teams || []).map(t => t.user_id).filter(Boolean))];
      let usersMap = {};
      if (userIds.length > 0) {
        const { data: users } = await supabase
          .from('users')
          .select('id, name')
          .in('id', userIds);
        for (const u of (users || [])) usersMap[u.id] = u;
      }

      const result = (teams || []).map(t => ({
        id: t.id,
        team_name: t.team_name,
        current_level: t.current_level,
        total_score: t.total_score,
        status: t.status,
        leader_name: usersMap[t.user_id]?.name || null
      }));

      return res.json(result);
    }

    // ─── GET /api/admin/activity ───
    if (req.method === 'GET' && path === '/activity') {
      const { data: logs, error } = await supabase
        .from('audit_logs')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(50);
      if (error) throw error;
      return res.json(logs || []);
    }

    // ─── GET /api/admin/audit-logs ───
    if (req.method === 'GET' && path === '/audit-logs') {
      const { data: logs, error } = await supabase
        .from('audit_logs')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(100);
      if (error) throw error;
      return res.json(logs || []);
    }

    return res.status(404).json({ error: 'Endpoint not found' });

  } catch (error) {
    console.error('Admin API error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
};
