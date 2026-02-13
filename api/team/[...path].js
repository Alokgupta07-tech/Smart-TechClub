const { getSupabase } = require('../_lib/supabase');
const { verifyAuth, setCorsHeaders } = require('../_lib/auth');

// Map team DB fields to API response (for backward compatibility)
function mapTeam(team) {
  if (!team) return null;
  return {
    id: team.id,
    team_name: team.team_name,
    level: team.level,
    status: team.status,
    progress: team.progress,
    start_time: team.start_time,
    end_time: team.end_time,
    hints_used: team.hints_used,
    user_id: team.user_id,
    created_at: team.created_at,
    current_level: team.level,
    total_score: 0,
    puzzles_solved: 0
  };
}

module.exports = async function handler(req, res) {
  setCorsHeaders(res);
  if (req.method === 'OPTIONS') return res.status(200).end();

  // Verify authentication
  const authResult = verifyAuth(req);
  if (authResult.error) {
    return res.status(authResult.status).json({ error: authResult.error, code: authResult.code });
  }

  const supabase = getSupabase();
  const path = req.url.replace('/api/team', '').split('?')[0];
  const user = authResult.user;

  try {
    // ─── GET /api/team/me ───
    if (req.method === 'GET' && path === '/me') {
      // Get team
      const { data: team, error: tErr } = await supabase
        .from('teams')
        .select('*')
        .eq('user_id', user.userId)
        .single();

      if (tErr || !team) {
        return res.status(404).json({ error: 'Team not found' });
      }

      // Get leader info
      const { data: leader } = await supabase
        .from('users')
        .select('name, email')
        .eq('id', user.userId)
        .single();

      // Get members
      const { data: members } = await supabase
        .from('team_members')
        .select('*')
        .eq('team_id', team.id);

      var mapped = mapTeam(team);
      mapped.leader_name = (leader && leader.name) ? leader.name : null;
      mapped.leader_email = (leader && leader.email) ? leader.email : null;
      mapped.members = members || [];
      return res.json(mapped);
    }

    // ─── GET /api/team/profile ───
    if (req.method === 'GET' && path === '/profile') {
      const { data: profile, error } = await supabase
        .from('users')
        .select('id, name, email, role, created_at')
        .eq('id', user.userId)
        .single();

      if (error || !profile) {
        return res.status(404).json({ error: 'User not found' });
      }
      return res.json(profile);
    }

    // ─── PUT /api/team/name ───
    if (req.method === 'PUT' && path === '/name') {
      const { teamName } = req.body;
      if (!teamName) {
        return res.status(400).json({ error: 'Team name is required' });
      }

      const { error } = await supabase
        .from('teams')
        .update({ team_name: teamName })
        .eq('user_id', user.userId);
      if (error) throw error;

      return res.json({ message: 'Team name updated' });
    }

    // ─── GET /api/team/qualification-message ───
    if (req.method === 'GET' && path === '/qualification-message') {
      // Parse query parameters manually from URL
      let unreadOnly = false;
      const qmark = req.url.indexOf('?');
      if (qmark !== -1) {
        const params = new URLSearchParams(req.url.slice(qmark + 1));
        unreadOnly = params.get('unread_only') === 'true';
      }
      
      // Get team ID
      const { data: team } = await supabase
        .from('teams')
        .select('id')
        .eq('user_id', user.userId)
        .single();

      if (!team) {
        return res.status(404).json({ error: 'Team not found' });
      }

      // Get qualification messages
      let query = supabase
        .from('team_qualification_messages')
        .select('*')
        .eq('team_id', team.id)
        .eq('is_dismissed', false);

      if (unreadOnly) {
        query = query.eq('is_read', false);
      }

      const { data: messages, error: msgError } = await query.order('created_at', { ascending: false });

      if (msgError) throw msgError;

      return res.json({
        success: true,
        messages: messages || [],
        unread_count: (messages || []).filter(m => !m.is_read).length
      });
    }

    // ─── POST /api/team/qualification-message/:id/read ───
    const readMatch = path.match(/^\/qualification-message\/([^\/]+)\/read$/);
    if (req.method === 'POST' && readMatch) {
      const messageId = readMatch[1];

      // Get team ID
      const { data: team } = await supabase
        .from('teams')
        .select('id')
        .eq('user_id', user.userId)
        .single();

      if (!team) {
        return res.status(404).json({ error: 'Team not found' });
      }

      const { error } = await supabase
        .from('team_qualification_messages')
        .update({
          is_read: true,
          read_at: new Date().toISOString()
        })
        .eq('id', messageId)
        .eq('team_id', team.id);

      if (error) throw error;

      return res.json({ success: true, message: 'Message marked as read' });
    }

    // ─── POST /api/team/qualification-message/:id/dismiss ───
    const dismissMatch = path.match(/^\/qualification-message\/([^\/]+)\/dismiss$/);
    if (req.method === 'POST' && dismissMatch) {
      const messageId = dismissMatch[1];

      // Get team ID
      const { data: team } = await supabase
        .from('teams')
        .select('id')
        .eq('user_id', user.userId)
        .single();

      if (!team) {
        return res.status(404).json({ error: 'Team not found' });
      }

      const { error } = await supabase
        .from('team_qualification_messages')
        .update({
          is_dismissed: true,
          dismissed_at: new Date().toISOString()
        })
        .eq('id', messageId)
        .eq('team_id', team.id);

      if (error) throw error;

      return res.json({ success: true, message: 'Message dismissed' });
    }

    return res.status(404).json({ error: 'Endpoint not found' });

  } catch (error) {
    console.error('Team API error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
};
