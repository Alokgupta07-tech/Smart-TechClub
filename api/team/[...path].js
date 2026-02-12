const { getSupabase } = require('../_lib/supabase');
const { verifyAuth, setCorsHeaders } = require('../_lib/auth');

// Map team DB fields to API response (for backward compatibility)
function mapTeam(team) {
  if (!team) return null;
  return {
    ...team,
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

      return res.json({
        ...mapTeam(team),
        leader_name: leader?.name || null,
        leader_email: leader?.email || null,
        members: members || []
      });
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

    return res.status(404).json({ error: 'Endpoint not found' });

  } catch (error) {
    console.error('Team API error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
};
