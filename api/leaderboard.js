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
    // ── Check if results have been published ──────────────────────────────
    const { data: gameState } = await supabase
      .from('game_state')
      .select('results_published, game_active')
      .limit(1)
      .single();

    const resultsPublished = gameState?.results_published || false;

    // ── Fetch teams ───────────────────────────────────────────────────────
    const { data: teams, error: tErr } = await supabase
      .from('teams')
      .select('id, team_name, level, status, user_id, start_time, end_time, hints_used')
      .neq('status', 'disqualified')
      .order('level', { ascending: false })
      .limit(100);

    if (tErr) throw tErr;

    if (!teams || teams.length === 0) {
      return res.json({ resultsPublished, teams: [] });
    }

    var teamIds = teams.map(t => t.id);

    // ── Parallel: users + submissions ─────────────────────────────────────
    var userIds = [...new Set(teams.map(t => t.user_id).filter(Boolean))];

    const [usersResult, submissionsResult, puzzleCountResult] = await Promise.all([
      userIds.length > 0
        ? supabase.from('users').select('id, name').in('id', userIds)
        : { data: [] },
      teamIds.length > 0
        ? supabase
          .from('submissions')
          .select('team_id, puzzle_id, score_awarded, is_correct, evaluation_status, submitted_at')
          .in('team_id', teamIds)
        : { data: [] },
      supabase.from('puzzles').select('id, level')
    ]);

    // Count puzzles per level
    var puzzleCounts = {};
    var totalPuzzleCount = 0;
    (puzzleCountResult.data || []).forEach(p => {
      if (!puzzleCounts[p.level]) puzzleCounts[p.level] = 0;
      puzzleCounts[p.level]++;
      totalPuzzleCount++;
    });

    // ── Build lookup maps ─────────────────────────────────────────────────
    var usersMap = {};
    (usersResult.data || []).forEach(u => { usersMap[u.id] = u; });

    // Per-team tallies
    var teamScores = {};    // total score from evaluated submissions
    var teamSolved = {};    // count of correct (evaluated) submissions
    var teamSubmitted = {}; // count of any submission (pre-evaluation tracking)

    (submissionsResult.data || []).forEach(sub => {
      if (!teamScores[sub.team_id]) teamScores[sub.team_id] = 0;
      if (!teamSolved[sub.team_id]) teamSolved[sub.team_id] = 0;
      if (!teamSubmitted[sub.team_id]) teamSubmitted[sub.team_id] = 0;

      teamSubmitted[sub.team_id]++;

      // Score & correct count only available after evaluation
      if (sub.evaluation_status === 'EVALUATED') {
        teamScores[sub.team_id] += sub.score_awarded || 0;
        if (sub.is_correct) teamSolved[sub.team_id]++;
      }
    });

    // ── Format time helper ────────────────────────────────────────────────
    function formatTime(startTime, endTime) {
      if (!startTime) return '--:--:--';
      const start = new Date(startTime).getTime();
      const end = endTime ? new Date(endTime).getTime() : Date.now();
      const secs = Math.floor((end - start) / 1000);
      const h = Math.floor(secs / 3600);
      const m = Math.floor((secs % 3600) / 60);
      const s = secs % 60;
      return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
    }

    function timeToSeconds(startTime, endTime) {
      if (!startTime) return Infinity;
      const start = new Date(startTime).getTime();
      const end = endTime ? new Date(endTime).getTime() : Date.now();
      return Math.floor((end - start) / 1000);
    }

    // ── Build result rows ─────────────────────────────────────────────────
    var result = teams.map(t => {
      var leaderUser = usersMap[t.user_id];
      var teamLevel = t.level || 1;
      // Total questions = sum of puzzles for all levels up to and including team's current level
      var teamTotalQuestions = 0;
      for (var lvl = 1; lvl <= teamLevel; lvl++) {
        teamTotalQuestions += puzzleCounts[lvl] || 0;
      }
      return {
        id: t.id,
        teamName: t.team_name,
        totalScore: teamScores[t.id] || 0,
        level: teamLevel,
        puzzlesSolved: teamSolved[t.id] || 0,
        puzzlesSubmitted: teamSubmitted[t.id] || 0,
        totalQuestions: teamTotalQuestions,
        status: t.status,
        leaderName: leaderUser?.name || null,
        hintsUsed: t.hints_used || 0,
        totalTime: formatTime(t.start_time, t.end_time),
        totalTimeSeconds: timeToSeconds(t.start_time, t.end_time),
      };
    });

    // ── Rank by: (1) score desc  (2) puzzlesSolved desc  (3) time asc ────
    result.sort((a, b) => {
      if (b.totalScore !== a.totalScore) return b.totalScore - a.totalScore;
      if (b.puzzlesSolved !== a.puzzlesSolved) return b.puzzlesSolved - a.puzzlesSolved;
      // faster time = lower rank number (better) - use numeric seconds, not string
      return (a.totalTimeSeconds - b.totalTimeSeconds);
    });

    result.forEach((r, i) => {
      r.rank = i + 1;
      r.change = 'none';
    });

    // Cache for 30s on CDN
    res.setHeader('Cache-Control', 's-maxage=30, stale-while-revalidate=60');

    return res.json({ resultsPublished, teams: result });

  } catch (error) {
    console.error('Leaderboard API error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
};
