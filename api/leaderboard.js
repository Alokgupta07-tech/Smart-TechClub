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
      .select('id, team_name, level, status, user_id')
      .neq('status', 'disqualified')
      .order('level', { ascending: false })
      .limit(100);

    if (tErr) throw tErr;

    // Get leader names
    var userIds = [];
    (teams || []).forEach(function(t) {
      if (t.user_id && userIds.indexOf(t.user_id) === -1) {
        userIds.push(t.user_id);
      }
    });
    var usersMap = {};
    if (userIds.length > 0) {
      const { data: users } = await supabase
        .from('users')
        .select('id, name')
        .in('id', userIds);
      (users || []).forEach(function(u) { usersMap[u.id] = u; });
    }

    // Calculate scores from submissions
    var teamIds = (teams || []).map(function(t) { return t.id; });
    const { data: submissions } = teamIds.length > 0 ? await supabase
      .from('submissions')
      .select('team_id, score_awarded, is_correct')
      .in('team_id', teamIds) : { data: [] };

    var teamScores = {};
    var teamSolved = {};
    (submissions || []).forEach(function(sub) {
      if (!teamScores[sub.team_id]) teamScores[sub.team_id] = 0;
      if (!teamSolved[sub.team_id]) teamSolved[sub.team_id] = 0;
      teamScores[sub.team_id] += sub.score_awarded || 0;
      if (sub.is_correct) teamSolved[sub.team_id]++;
    });

    var result = (teams || []).map(function(t) {
      var leaderUser = usersMap[t.user_id];
      return {
        id: t.id,
        team_name: t.team_name,
        total_score: teamScores[t.id] || 0,
        current_level: t.level,
        puzzles_solved: teamSolved[t.id] || 0,
        status: t.status,
        leader_name: (leaderUser && leaderUser.name) ? leaderUser.name : null
      };
    }).sort(function(a, b) {
      return (b.total_score - a.total_score) || (b.puzzles_solved - a.puzzles_solved);
    });

    return res.json(result);

  } catch (error) {
    console.error('Leaderboard API error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
};
