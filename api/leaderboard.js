const { getSupabase } = require('./_lib/supabase');
const { setCorsHeaders } = require('./_lib/auth');

module.exports = async function handler(req, res) {
  setCorsHeaders(res);
  if (req.method === 'OPTIONS') return res.status(200).end();

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const supabase = getSupabase();

  try {
    // Get teams (excluding disqualified)
    const { data: teams, error: tErr } = await supabase
      .from('teams')
      .select('id, team_name, total_score, current_level, puzzles_solved, status, user_id')
      .neq('status', 'disqualified')
      .order('total_score', { ascending: false })
      .order('puzzles_solved', { ascending: false })
      .limit(100);

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
      total_score: t.total_score,
      current_level: t.current_level,
      puzzles_solved: t.puzzles_solved,
      status: t.status,
      leader_name: usersMap[t.user_id]?.name || null
    }));

    return res.json(result);

  } catch (error) {
    console.error('Leaderboard API error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
};
