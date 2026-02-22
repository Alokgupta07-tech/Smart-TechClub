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

/**
 * Check if a team can access a specific level (simplified)
 * Level 1: Always accessible
 * Level 2+: Check if team.level >= requested level
 */
async function checkLevelAccess(supabase, teamId, levelId) {
  // Level 1 is always accessible
  if (levelId <= 1) {
    return { allowed: true, reason: 'Level 1 accessible' };
  }

  // For Level 2+: Check team's current level
  try {
    const { data: team } = await supabase
      .from('teams')
      .select('level, status')
      .eq('id', teamId)
      .single();

    if (!team) {
      return {
        allowed: false,
        reason: 'Team not found'
      };
    }

    if (team.status !== 'active') {
      return {
        allowed: false,
        reason: 'Team is not active'
      };
    }

    const teamLevel = team.level || 1;

    if (teamLevel >= levelId) {
      return {
        allowed: true,
        reason: 'Level ' + levelId + ' accessible'
      };
    }

    return {
      allowed: false,
      reason: 'You must be promoted to Level ' + levelId + ' to access these puzzles. Complete Level ' + (levelId - 1) + ' first.'
    };
  } catch (e) {
    console.error('checkLevelAccess error:', e);
    return {
      allowed: false,
      reason: 'Error checking level access'
    };
  }
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

      // Teams can always access puzzles for their currently assigned level (team.level)
      // The assignment itself (via admin or qualification) already verified access rights
      // No need to re-check level access for current level gameplay

      // Parallel fetch: puzzles + submissions (reduces latency by ~50%)
      const [puzzlesResult, submissionsResult] = await Promise.all([
        supabase
          .from('puzzles')
          .select('*')
          .eq('level', team.level)
          .order('puzzle_number', { ascending: true }),
        supabase
          .from('submissions')
          .select('puzzle_id, submitted_answer, is_correct')
          .eq('team_id', team.id)
      ]);

      if (puzzlesResult.error) throw puzzlesResult.error;
      const puzzles = puzzlesResult.data;

      if (!puzzles || puzzles.length === 0) {
        return res.status(404).json({
          success: false,
          error: 'No active puzzle found. Please wait for the game to start or contact admin.'
        });
      }

      const completedPuzzleIds = new Set();
      const submittedAnswers = {};
      if (submissionsResult.data) {
        submissionsResult.data.forEach(function (sub) {
          if (sub.is_correct) {
            completedPuzzleIds.add(sub.puzzle_id);
          }
          submittedAnswers[sub.puzzle_id] = sub.submitted_answer;
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

      // Parallel fetch: progress + hints + usedHints (reduces latency)
      const [progressResult, allHintsResult, usedHintsResult] = await Promise.all([
        supabase
          .from('team_progress')
          .select('*')
          .eq('team_id', team.id)
          .eq('puzzle_id', currentPuzzle.id),
        supabase
          .from('hints')
          .select('*')
          .eq('puzzle_id', currentPuzzle.id)
          .order('hint_number', { ascending: true }),
        supabase
          .from('team_hints_used')
          .select('hint_id')
          .eq('team_id', team.id)
          .eq('puzzle_id', currentPuzzle.id)
      ]);

      const progress = progressResult.data;
      const allHints = allHintsResult.data;
      const usedHintIds = (usedHintsResult.data || []).map(h => h.hint_id);
      const availableHints = (allHints || []).filter(h => !usedHintIds.includes(h.id));

      // Calculate time remaining (dynamic based on level: 40 minutes for Level 1, 60 minutes for Level 2)
      const TIME_LIMIT_SECONDS = (team.level === 2) ? (60 * 60) : (40 * 60);
      let timeRemainingSeconds = TIME_LIMIT_SECONDS;
      let timeExpired = false;

      if (team.start_time) {
        const startTime = new Date(team.start_time).getTime();
        const now = Date.now();
        const elapsedSeconds = Math.floor((now - startTime) / 1000);
        timeRemainingSeconds = Math.max(0, TIME_LIMIT_SECONDS - elapsedSeconds);
        timeExpired = timeRemainingSeconds <= 0;
      }

      // Strip correct_answer before sending to client (security)
      const { correct_answer: _answer, ...safePuzzle } = currentPuzzle;

      return res.json({
        success: true,
        puzzle: {
          ...safePuzzle,
          progress: (progress && progress[0]) || { attempts: 0, hints_used: 0 },
          available_hints: availableHints.length,
          total_hints: (allHints || []).length,
          is_completed: completedPuzzleIds.has(currentPuzzle.id),
          submitted_answer: submittedAnswers[currentPuzzle.id] || null
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
      const { puzzle_id, answer } = req.body || {};

      // Input validation
      if (!puzzle_id || !answer || typeof answer !== 'string') {
        return res.status(400).json({ success: false, error: 'puzzle_id and answer are required' });
      }

      // Parallel fetch: team + puzzle (reduces latency)
      const [teamResult, puzzleResult] = await Promise.all([
        supabase
          .from('teams')
          .select('*')
          .eq('user_id', user.userId)
          .single(),
        supabase
          .from('puzzles')
          .select('*')
          .eq('id', puzzle_id)
          .single()
      ]);

      if (teamResult.error || !teamResult.data) {
        return res.status(404).json({ error: 'Team not found', details: teamResult.error?.message });
      }
      if (puzzleResult.error || !puzzleResult.data) {
        return res.status(404).json({ error: 'Puzzle not found', details: puzzleResult.error?.message });
      }

      const team = teamResult.data;
      const puzzle = puzzleResult.data;

      // Check if team can access this puzzle's level
      const submitLevelCheck = await checkLevelAccess(supabase, team.id, puzzle.level);
      if (!submitLevelCheck.allowed) {
        return res.status(403).json({
          success: false,
          error: submitLevelCheck.reason,
          code: 'LEVEL_ACCESS_DENIED',
          qualification_status: submitLevelCheck.qualification_status
        });
      }

      // Validate answer against correct answer
      const isCorrect = puzzle.correct_answer
        ? answer.trim().toLowerCase() === puzzle.correct_answer.trim().toLowerCase()
        : false;

      // Check if a submission already exists for this team+puzzle
      const { data: existingSub } = await supabase
        .from('submissions')
        .select('id')
        .eq('team_id', team.id)
        .eq('puzzle_id', puzzle_id)
        .limit(1);

      let subError = null;
      if (existingSub && existingSub.length > 0) {
        // Update existing submission
        const { error } = await supabase
          .from('submissions')
          .update({ submitted_answer: answer, is_correct: isCorrect })
          .eq('id', existingSub[0].id);
        subError = error;
      } else {
        // Insert new submission
        const { error } = await supabase.from('submissions').insert({
          id: crypto.randomUUID(),
          team_id: team.id,
          puzzle_id: puzzle_id,
          submitted_answer: answer,
          is_correct: isCorrect
        });
        subError = error;
      }

      if (subError) {
        console.error('Submission save error:', JSON.stringify(subError));
        return res.status(500).json({
          success: false,
          error: 'Failed to save your answer. Please try again.',
          details: subError.message || subError.code || 'Unknown DB error'
        });
      }

      // Log activity (non-blocking, ignore errors)
      supabase.from('activity_logs').insert({
        id: crypto.randomUUID(),
        team_id: team.id,
        user_id: user.userId,
        action_type: 'puzzle_solve',
        description: 'Submitted answer for puzzle: ' + (puzzle.title || puzzle_id),
        puzzle_id: puzzle_id
      }).then(function() {}).catch(function() {});

      // Also set start_time if not already set
      if (!team.start_time) {
        await supabase.from('teams').update({ start_time: new Date().toISOString() }).eq('id', team.id);
      }

      // Get all puzzles in current level to find next one
      const { data: allPuzzles } = await supabase
        .from('puzzles')
        .select('id, level, puzzle_number, title, points')
        .eq('level', puzzle.level)
        .order('puzzle_number', { ascending: true });

      // Get all submissions for this team for current level puzzles only (correct ones)
      const currentLevelPuzzleIds = (allPuzzles || []).map(p => p.id);
      const { data: correctSubs } = await supabase
        .from('submissions')
        .select('puzzle_id')
        .eq('team_id', team.id)
        .eq('is_correct', true)
        .in('puzzle_id', currentLevelPuzzleIds.length > 0 ? currentLevelPuzzleIds : ['__none__']);

      const completedPuzzleIds = new Set((correctSubs || []).map(s => s.puzzle_id));

      // Add current puzzle only if answer is correct
      if (isCorrect) {
        completedPuzzleIds.add(puzzle_id);

        // Update team_question_progress for correct answer
        try {
          const { data: existingTqp } = await supabase
            .from('team_question_progress')
            .select('id')
            .eq('team_id', team.id)
            .eq('puzzle_id', puzzle_id)
            .limit(1);

          if (existingTqp && existingTqp.length > 0) {
            await supabase.from('team_question_progress')
              .update({ status: 'COMPLETED', completed_at: new Date().toISOString(), updated_at: new Date().toISOString() })
              .eq('team_id', team.id).eq('puzzle_id', puzzle_id);
          } else {
            await supabase.from('team_question_progress').insert({
              id: crypto.randomUUID(), team_id: team.id, puzzle_id: puzzle_id,
              status: 'COMPLETED', completed_at: new Date().toISOString(), correct: true
            });
          }
        } catch (e) { console.log('team_question_progress update error:', e.message); }
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

      // Check if all puzzles in current level are completed
      const currentLevelCompleted = !nextPuzzle && isCorrect;
      let levelCompleted = false;

      if (currentLevelCompleted) {
        levelCompleted = true;

        // Update team progress to 100% for this level
        await supabase
          .from('teams')
          .update({ progress: 100 })
          .eq('id', team.id);

        // Mark team_level_status as COMPLETED for this level (if table exists)
        try {
          const { data: existingStatus } = await supabase
            .from('team_level_status')
            .select('id')
            .eq('team_id', team.id)
            .eq('level_id', puzzle.level)
            .limit(1);

          if (existingStatus && existingStatus.length > 0) {
            await supabase.from('team_level_status')
              .update({ status: 'COMPLETED', completed_at: new Date().toISOString() })
              .eq('team_id', team.id)
              .eq('level_id', puzzle.level);
          } else {
            await supabase.from('team_level_status').insert({
              id: crypto.randomUUID(),
              team_id: team.id,
              level_id: puzzle.level,
              status: 'COMPLETED',
              completed_at: new Date().toISOString(),
              qualification_status: 'PENDING'
            });
          }
        } catch (e) {
          console.log('team_level_status update error:', e.message);
        }

        // Check if there are puzzles in a next level
        const { data: nextLevelPuzzles } = await supabase
          .from('puzzles')
          .select('id')
          .gt('level', puzzle.level)
          .limit(1);

        const hasNextLevel = nextLevelPuzzles && nextLevelPuzzles.length > 0;

        if (!hasNextLevel) {
          // No more levels - game truly completed
          await supabase
            .from('teams')
            .update({ status: 'completed', end_time: new Date().toISOString(), progress: 100 })
            .eq('id', team.id);
        }

        // Note: team.level is NOT auto-advanced here.
        // The admin must: 1) evaluate, 2) publish results, 3) unlock Level 2
        // Then the admin qualifies teams (or auto-qualification runs)
        // Only then does the qualified team's level get updated to 2
      }

      // Always return response that allows moving to next question
      return res.json({
        success: true,
        is_correct: isCorrect,
        message: isCorrect
          ? (levelCompleted ? 'Correct! You have completed all puzzles in this level.' : 'Correct answer!')
          : 'Answer recorded.',
        points_earned: isCorrect ? (puzzle.points || 0) : 0,
        next_puzzle: nextPuzzle,
        level_completed: levelCompleted,
        game_completed: levelCompleted && !nextPuzzle
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
        .select('id, is_correct')
        .eq('team_id', team.id);

      var total = subs ? subs.length : 0;
      var correct = subs ? subs.filter(s => s.is_correct === true).length : 0;

      // Calculate time elapsed
      var timeElapsed = 0;
      if (team.start_time) {
        timeElapsed = Math.floor((Date.now() - new Date(team.start_time).getTime()) / 1000);
      }

      return res.json({
        success: true,
        progress: {
          team_name: team.team_name,
          current_level: team.level || 1,
          progress: team.progress || 0,
          hints_used: team.hints_used || 0,
          status: team.status,
          start_time: team.start_time,
          end_time: team.end_time,
          completed_puzzles: correct,
          total_puzzles: total,
          time_elapsed_seconds: timeElapsed
        },
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
