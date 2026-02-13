const crypto = require('crypto');
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
  const path = req.url.replace('/api/gameplay', '').split('?')[0];
  const user = authResult.user;

  try {
    // ─── GET /api/gameplay/current OR /api/gameplay/puzzle/current ───
    if (req.method === 'GET' && (path === '/current' || path === '/puzzle/current')) {
      const { data: team, error: tErr } = await supabase
        .from('teams')
        .select('*')
        .eq('user_id', user.userId)
        .single();

      if (tErr || !team) {
        return res.status(404).json({ error: 'Team not found' });
      }

      const { data: puzzles, error: pErr } = await supabase
        .from('puzzles')
        .select('*')
        .eq('level', team.level)
        .order('puzzle_number', { ascending: true });

      if (pErr) throw pErr;

      if (!puzzles || puzzles.length === 0) {
        return res.status(404).json({ 
          success: false, 
          error: 'No active puzzle found. Please wait for the game to start or contact admin.' 
        });
      }

      // Get the first puzzle for the team's level
      const puzzle = puzzles[0];

      // Get puzzle progress
      const { data: progress } = await supabase
        .from('team_progress')
        .select('*')
        .eq('team_id', team.id)
        .eq('puzzle_id', puzzle.id);

      // Get hints
      const { data: allHints } = await supabase
        .from('hints')
        .select('*')
        .eq('puzzle_id', puzzle.id)
        .order('hint_order', { ascending: true });

      const { data: usedHints } = await supabase
        .from('team_hints_used')
        .select('hint_id')
        .eq('team_id', team.id)
        .eq('puzzle_id', puzzle.id);

      const usedHintIds = (usedHints || []).map(h => h.hint_id);
      const availableHints = (allHints || []).filter(h => !usedHintIds.includes(h.id));

      return res.json({
        success: true,
        puzzle: {
          ...puzzle,
          progress: (progress && progress[0]) || { attempts: 0, hints_used: 0 },
          available_hints: availableHints.length,
          total_hints: (allHints || []).length
        },
        team: mapTeam(team)
      });
    }

    // ─── POST /api/gameplay/puzzle/submit ───
    if (req.method === 'POST' && path === '/puzzle/submit') {
      const { puzzle_id, answer } = req.body;

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
        .eq('id', puzzle_id)
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
          puzzle_id: puzzle_id,
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
          puzzle_id: puzzle_id,
          submitted_answer: answer,
          is_correct: false,
          score_awarded: 0
        });

        return res.json({ correct: false, message: 'Incorrect answer. Try again!' });
      }
    }

    // ─── POST /api/gameplay/puzzle/hint ───
    if (req.method === 'POST' && path === '/puzzle/hint') {
      const { puzzle_id, hintNumber } = req.body;

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
        .eq('puzzle_id', puzzle_id)
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

      var total = subs ? subs.length : 0;
      var correct = 0;
      if (subs) {
        for (var i = 0; i < subs.length; i++) {
          if (subs[i].is_correct) correct++;
        }
      }

      return res.json({
        team: mapTeam(team),
        submissions: { total: total, correct: correct }
      });
    }

    return res.status(404).json({ error: 'Endpoint not found' });

  } catch (error) {
    console.error('Gameplay API error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
};
