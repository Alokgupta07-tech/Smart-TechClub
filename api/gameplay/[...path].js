const crypto = require('crypto');
const { getSupabase } = require('../_lib/supabase');
const { verifyAuth, setCorsHeaders } = require('../_lib/auth');

// Map team DB fields to API response (for backward compatibility)
function mapTeam(team) {
  if (!team) return null;
  return {
    ...team,
    current_level: team.level,
    total_score: 0, // Calculated from submissions if needed
    puzzles_solved: 0 // Calculated from submissions if needed
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
  const path = req.url.replace('/api/gameplay', '').split('?')[0];
  const user = authResult.user;

  try {
    // ─── GET /api/gameplay/current ───
    if (req.method === 'GET' && path === '/current') {
      const { data: team, error: tErr } = await supabase
        .from('teams')
        .select('*')
        .eq('user_id', user.userId)
        .single();

      if (tErr || !team) {
        return res.status(404).json({ error: 'Team not found' });
      }

      const { data: puzzles } = await supabase
        .from('puzzles')
        .select('id, title, description, puzzle_type, level, points')
        .eq('level', team.level)
        .order('puzzle_number', { ascending: true })
        .limit(1);

      if (!puzzles || puzzles.length === 0) {
        return res.json({ message: 'No puzzles available for this level', puzzle: null });
      }

      return res.json({ puzzle: puzzles[0], team: mapTeam(team) });
    }

    // ─── POST /api/gameplay/puzzle/submit ───
    if (req.method === 'POST' && path === '/puzzle/submit') {
      const { puzzleId, answer } = req.body;

      const { data: team, error: tErr } = await supabase
        .from('teams')
        .select('*')
        .eq('user_id', user.userId)
        .single();
      if (tErr || !team) {
        return res.status(404).json({ error: 'Team not found' });
      }

      const { data: puzzle, error: pErr } = await supabase
        .from('puzzles')
        .select('*')
        .eq('id', puzzleId)
        .single();
      if (pErr || !puzzle) {
        return res.status(404).json({ error: 'Puzzle not found' });
      }

      const isCorrect = puzzle.correct_answer.toLowerCase().trim() === answer.toLowerCase().trim();

      if (isCorrect) {

        // Record submission
        const { error: subErr } = await supabase.from('submissions').insert({
          id: crypto.randomUUID(),
          team_id: team.id,
          puzzle_id: puzzleId,
          submitted_answer: answer,
          is_correct: true,
          score_awarded: puzzle.points
        });
        if (subErr) throw subErr;

        return res.json({ correct: true, message: 'Correct answer!', pointsEarned: puzzle.points });
      } else {
        // Record wrong submission
        await supabase.from('submissions').insert({
          id: crypto.randomUUID(),
          team_id: team.id,
          puzzle_id: puzzleId,
          submitted_answer: answer,
          is_correct: false,
          score_awarded: 0
        });

        return res.json({ correct: false, message: 'Incorrect answer. Try again!' });
      }
    }

    // ─── POST /api/gameplay/puzzle/hint ───
    if (req.method === 'POST' && path === '/puzzle/hint') {
      const { puzzleId, hintNumber } = req.body;

      const { data: team } = await supabase
        .from('teams')
        .select('*')
        .eq('user_id', user.userId)
        .single();
      if (!team) return res.status(404).json({ error: 'Team not found' });

      if (team.hints_used >= 3) {
        return res.status(400).json({ error: 'No hints remaining' });
      }

      // Get hint from hints table
      const { data: hints } = await supabase
        .from('hints')
        .select('*')
        .eq('puzzle_id', puzzleId)
        .eq('hint_number', hintNumber)
        .eq('is_active', true)
        .single();
      
      if (!hints) return res.status(404).json({ error: 'Hint not available' });

      // Update hints used
      const { error: upErr } = await supabase
        .from('teams')
        .update({
          hints_used: (team.hints_used || 0) + 1
        })
        .eq('id', team.id);
      if (upErr) throw upErr;

      return res.json({
        hint: hints.hint_text,
        hintsRemaining: 2 - (team.hints_used || 0),
        penaltyApplied: 10
      });
    }

    // ─── GET /api/gameplay/progress ───
    if (req.method === 'GET' && path === '/progress') {
      const { data: team } = await supabase
        .from('teams')
        .select('*')
        .eq('user_id', user.userId)
        .single();
      if (!team) return res.status(404).json({ error: 'Team not found' });

      // Get submission stats
      const { data: subs } = await supabase
        .from('submissions')
        .select('is_correct')
        .eq('team_id', team.id);

      const total = subs ? subs.length : 0;
      const correct = subs ? subs.filter(s => s.is_correct).length : 0;

      return res.json({
        team: mapTeam(team),
        submissions: { total, correct }
      });
    }

    return res.status(404).json({ error: 'Endpoint not found' });

  } catch (error) {
    console.error('Gameplay API error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
};
