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
  
  // Parse query parameters
  const urlParts = req.url.split('?');
  const queryParams = new URLSearchParams(urlParts[1] || '');

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
      
      // Check if a specific puzzle_id is requested
      const requestedPuzzleId = queryParams.get('puzzle_id');
      let currentPuzzle = null;
      
      if (requestedPuzzleId) {
        // Find the requested puzzle
        currentPuzzle = puzzles.find(p => p.id === requestedPuzzleId);
        if (!currentPuzzle) {
          // Fallback to first incomplete puzzle
          currentPuzzle = puzzles[0];
          for (let i = 0; i < puzzles.length; i++) {
            if (!completedPuzzleIds.has(puzzles[i].id)) {
              currentPuzzle = puzzles[i];
              break;
            }
          }
        }
      } else {
        // Find first incomplete puzzle or first puzzle
        currentPuzzle = puzzles[0];
        for (let i = 0; i < puzzles.length; i++) {
          if (!completedPuzzleIds.has(puzzles[i].id)) {
            currentPuzzle = puzzles[i];
            break;
          }
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

      // Calculate time remaining (40 minutes = 2400 seconds)
      const TIME_LIMIT_SECONDS = 40 * 60; // 40 minutes
      let timeRemainingSeconds = TIME_LIMIT_SECONDS;
      let timeExpired = false;
      
      if (team.start_time) {
        const startTime = new Date(team.start_time).getTime();
        const now = Date.now();
        const elapsedSeconds = Math.floor((now - startTime) / 1000);
        timeRemainingSeconds = Math.max(0, TIME_LIMIT_SECONDS - elapsedSeconds);
        timeExpired = timeRemainingSeconds <= 0;
      }

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
        completed_puzzles: completedPuzzleIds.size,
        time_remaining_seconds: timeRemainingSeconds,
        time_expired: timeExpired
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

      // Record submission (both correct and incorrect)
      const { error: subError } = await supabase.from('submissions').insert({
        id: crypto.randomUUID(),
        team_id: team.id,
        puzzle_id: puzzle_id,
        submitted_answer: answer,
        is_correct: isCorrect,
        score_awarded: isCorrect ? puzzle.points : 0
      });
      
      if (subError) {
        console.error('Submission insert error:', subError);
      }
      
      // Also set start_time if not already set
      if (!team.start_time) {
        await supabase.from('teams').update({ start_time: new Date().toISOString() }).eq('id', team.id);
      }

      // Get all puzzles to find next one
      const { data: allPuzzles } = await supabase
        .from('puzzles')
        .select('id, level, puzzle_number, title, points')
        .eq('level', puzzle.level)
        .order('puzzle_number', { ascending: true });

      // Get all correct submissions for this team
      const { data: correctSubs } = await supabase
        .from('submissions')
        .select('puzzle_id')
        .eq('team_id', team.id)
        .eq('is_correct', true);

      const completedPuzzleIds = new Set((correctSubs || []).map(s => s.puzzle_id));
      
      // Add current puzzle if correct
      if (isCorrect) {
        completedPuzzleIds.add(puzzle_id);
      }

      // Find next incomplete puzzle
      let nextPuzzle = null;
      if (allPuzzles && allPuzzles.length > 0) {
        // First try to find next puzzle after current one
        const currentIndex = allPuzzles.findIndex(p => p.id === puzzle_id);
        for (let i = currentIndex + 1; i < allPuzzles.length; i++) {
          if (!completedPuzzleIds.has(allPuzzles[i].id)) {
            nextPuzzle = allPuzzles[i];
            break;
          }
        }
        // If no next puzzle found, wrap around to find any incomplete puzzle
        if (!nextPuzzle) {
          for (let i = 0; i < allPuzzles.length; i++) {
            if (!completedPuzzleIds.has(allPuzzles[i].id)) {
              nextPuzzle = allPuzzles[i];
              break;
            }
          }
        }
      }

      // Check if game is completed (all puzzles done)
      const totalPuzzles = allPuzzles ? allPuzzles.length : 0;
      const gameCompleted = completedPuzzleIds.size >= totalPuzzles && totalPuzzles > 0;

      if (gameCompleted) {
        // Update team status to completed
        await supabase
          .from('teams')
          .update({ status: 'completed', end_time: new Date().toISOString(), progress: 100 })
          .eq('id', team.id);
      }

      // Always return response that allows moving to next question
      return res.json({
        success: true,
        is_correct: isCorrect,
        message: isCorrect ? 'Correct answer!' : 'Incorrect answer. Try again!',
        points_earned: isCorrect ? puzzle.points : 0,
        next_puzzle: nextPuzzle,
        game_completed: gameCompleted
      });
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
