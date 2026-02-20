const { getSupabase } = require('./_lib/supabase');
const { setCorsHeaders } = require('./_lib/auth');

module.exports = async function handler(req, res) {
  setCorsHeaders(res);
  if (req.method === 'OPTIONS') return res.status(200).end();

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Add caching headers for better performance with 200+ users
  // Cache for 30 seconds on CDN, stale-while-revalidate for 60s
  res.setHeader('Cache-Control', 's-maxage=30, stale-while-revalidate=60');

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

    // Early exit if no teams
    if (!teams || teams.length === 0) {
      return res.json([]);
    }

    // Extract unique user IDs and team IDs
    var userIds = [];
    var teamIds = [];
    teams.forEach(function (t) {
      teamIds.push(t.id);
      if (t.user_id && userIds.indexOf(t.user_id) === -1) {
        userIds.push(t.user_id);
      }
    });

    // Run users and submissions queries in parallel for better performance
    const [usersResult, submissionsResult] = await Promise.all([
      userIds.length > 0
        ? supabase.from('users').select('id, name').in('id', userIds)
        : { data: [] },
      teamIds.length > 0
        ? supabase.from('submissions').select('team_id, score_awarded, is_correct').in('team_id', teamIds)
        : { data: [] }
    ]);

    // Build users map
    var usersMap = {};
    (usersResult.data || []).forEach(function (u) { usersMap[u.id] = u; });

    // Calculate scores and solved counts
    var teamScores = {};
    var teamSolved = {};
    (submissionsResult.data || []).forEach(function (sub) {
      if (!teamScores[sub.team_id]) teamScores[sub.team_id] = 0;
      if (!teamSolved[sub.team_id]) teamSolved[sub.team_id] = 0;
      teamScores[sub.team_id] += sub.score_awarded || 0;
      if (sub.is_correct) teamSolved[sub.team_id]++;
    });

    var result = teams.map(function (t) {
      var leaderUser = usersMap[t.user_id];
      return {
        id: t.id,
        teamName: t.team_name,
        totalScore: teamScores[t.id] || 0,
        level: t.level || 1,
        puzzlesSolved: teamSolved[t.id] || 0,
        status: t.status,
        leaderName: (leaderUser && leaderUser.name) ? leaderUser.name : null,
        hintsUsed: 0,
        totalTime: "--:--:--"
      };
    }).sort(function (a, b) {
      return (b.totalScore - a.totalScore) || (b.puzzlesSolved - a.puzzlesSolved);
    });

    result.forEach((r, index) => {
      r.rank = index + 1;
      r.change = 'none';
    });

    return res.json(result);

  } catch (error) {
    console.error('Leaderboard API error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
};
