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

      // Get all puzzles for team's level
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

      // Get all successful submissions
      const { data: submissions } = await supabase
        .from('submissions')
        .select('puzzle_id, is_correct')
        .eq('team_id', team.id);
      
      const completedPuzzleIds = new Set();
      if (submissions) {
        submissions.forEach(function(sub) {
          if (sub.is_correct) completedPuzzleIds.add(sub.puzzle_id);
        });
      }
      
      // Find first incomplete puzzle or first puzzle
      let currentPuzzle = puzzles[0];
      for (let i = 0; i < puzzles.length; i++) {
        if (!completedPuzzleIds.has(puzzles[i].id)) {
          currentPuzzle = puzzles[i];
          break;
        }
      }

      // Get puzzle progress
      const { data: progress } = await supabase
        .from('team_progress')
        .select('*')
        .eq('team_id', team.id)
        .eq('puzzle_id', currentPuzzle.id);

      // Get hints for current puzzle
      const { data: allHints } = await supabase
        .from('hints')
        .select('*')
        .eq('puzzle_id', currentPuzzle.id)
        .order('hint_number', { ascending: true });

      const { data: usedHints } = await supabase
        .from('team_hints_used')
        .select('hint_id')
        .eq('team_id', team.id)
        .eq('puzzle_id', currentPuzzle.id);

      const usedHintIds = (usedHints || []).map(h => h.hint_id);
      const availableHints = (allHints || []).filter(h => !usedHintIds.includes(h.id));

      return res.json({
        success: true,
        puzzle: {
          ...currentPuzzle,
          progress: (progress && progress[0]) || { attempts: 0, hints_used: 0 },
          available_hints: availableHints.length,
          total_hints: (allHints || []).length,
          is_completed: completedPuzzleIds.has(currentPuzzle.id)
        },
        team: mapTeam(team),
        total_puzzles: puzzles.length,
        completed_puzzles: completedPuzzleIds.size
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
      const { puzzle_id } = req.body;

      const { data: team } = await supabase
        .from('teams')
        .select('*')
        .eq('user_id', user.userId)
        .single();
      if (!team) return res.status(404).json({ error: 'Team not found' });

      if (team.hints_used >= 3) {
        return res.status(400).json({ error: 'No hints remaining' });
      }

      // Get the next hint (based on how many hints used already for this puzzle)
      const { data: usedHints } = await supabase
        .from('team_hints_used')
        .select('hint_id')
        .eq('team_id', team.id)
        .eq('puzzle_id', puzzle_id);
      
      const usedCount = (usedHints || []).length;
      
      // Get next available hint
      const { data: availableHints } = await supabase
        .from('hints')
        .select('*')
        .eq('puzzle_id', puzzle_id)
        .eq('is_active', true)
        .order('hint_number', { ascending: true });
      
      if (!availableHints || availableHints.length === 0) {
        return res.status(404).json({ error: 'No hints available for this puzzle' });
      }
      
      // Find next unused hint
      const usedHintIds = new Set((usedHints || []).map(h => h.hint_id));
      const nextHint = availableHints.find(h => !usedHintIds.has(h.id));
      
      if (!nextHint) {
        return res.status(400).json({ error: 'All hints used for this puzzle' });
      }

      // Record hint usage
      await supabase.from('team_hints_used').insert({
        id: crypto.randomUUID(),
        team_id: team.id,
        puzzle_id: puzzle_id,
        hint_id: nextHint.id,
        created_at: new Date().toISOString()
      });

      // Update hints used count on team
      const { error: upErr } = await supabase
        .from('teams')
        .update({
          hints_used: (team.hints_used || 0) + 1
        })
        .eq('id', team.id);
      if (upErr) throw upErr;

      return res.json({
        hint: {
          hint_text: nextHint.hint_text,
          hint_number: nextHint.hint_number,
          time_penalty_seconds: nextHint.time_penalty_seconds || 300
        },
        hintsRemaining: 2 - (team.hints_used || 0),
        penaltyApplied: nextHint.time_penalty_seconds || 300
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
