const crypto = require('crypto');
const { getSupabase } = require('../_lib/supabase');
const { verifyAuth, requireAdmin, setCorsHeaders } = require('../_lib/auth');

// Cache game_state ID to avoid repeated lookups (singleton table)
let cachedGameStateId = null;

async function getGameStateId(supabase) {
  if (cachedGameStateId) return cachedGameStateId;

  const { data, error } = await supabase.from('game_state').select('id').limit(1).single();
  if (data && data.id) {
    cachedGameStateId = data.id;
    return cachedGameStateId;
  }

  // If no game state exists, create one
  if (error || !data) {
    const { data: newState, error: insertError } = await supabase
      .from('game_state')
      .insert({
        game_active: false,
        current_level: 1,
        level1_open: true,
        level2_open: false
      })
      .select('id')
      .single();

    if (newState && newState.id) {
      cachedGameStateId = newState.id;
      return cachedGameStateId;
    }

    // Last resort: try to get any existing row
    const { data: anyState } = await supabase.from('game_state').select('id').limit(1);
    if (anyState && anyState.length > 0) {
      cachedGameStateId = anyState[0].id;
      return cachedGameStateId;
    }
  }

  throw new Error('Unable to find or create game_state');
}

module.exports = async function handler(req, res) {
  setCorsHeaders(res);
  if (req.method === 'OPTIONS') return res.status(200).end();

  const supabase = getSupabase();
  const path = req.url.replace('/api/game', '').split('?')[0];

  try {
    // ─── GET /api/game/state — Public ───
    if (req.method === 'GET' && path === '/state') {
      const { data: states, error } = await supabase
        .from('game_state')
        .select('*')
        .limit(1);

      if (error) throw error;

      if (!states || states.length === 0) {
        // Return default game state (will be created by seed data)
        return res.json({
          game_active: false,
          current_level: 1,
          level1_open: true,
          level2_open: false,
          game_started_at: null,
          game_ended_at: null,
          results_published: false
        });
      }

      return res.json(states[0]);
    }

    // ─── GET /api/game/features — Public (for celebration modal trigger) ───
    if (req.method === 'GET' && path === '/features') {
      try {
        const { data: states, error } = await supabase
          .from('game_state')
          .select('game_active, game_ended_at, results_published')
          .limit(1);

        // Handle case where results_published column doesn't exist yet
        if (error && error.message && error.message.includes('results_published')) {
          // Fallback: fetch without results_published
          const { data: fallbackStates } = await supabase
            .from('game_state')
            .select('game_active, game_ended_at')
            .limit(1);

          const fallbackState = fallbackStates && fallbackStates.length > 0 ? fallbackStates[0] : {};
          return res.json({
            resultsPublished: false,
            gameEnded: !!fallbackState.game_ended_at,
            gameActive: fallbackState.game_active || false,
            gameEndTime: fallbackState.game_ended_at || null
          });
        }

        if (error) throw error;

        const gameState = states && states.length > 0 ? states[0] : {};

        return res.json({
          resultsPublished: gameState.results_published || false,
          gameEnded: !!gameState.game_ended_at,
          gameActive: gameState.game_active || false,
          gameEndTime: gameState.game_ended_at || null
        });
      } catch (featuresError) {
        // Graceful fallback if anything fails
        console.error('Features endpoint error:', featuresError.message);
        return res.json({
          resultsPublished: false,
          gameEnded: false,
          gameActive: false,
          gameEndTime: null
        });
      }
    }

    // ─── User-authenticated time tracking routes ───
    var isTimeTrackingRoute = path === '/session' || path === '/time/session' ||
      path === '/start-question' || path === '/time/start-question' ||
      path === '/pause-question' || path === '/time/pause-question' ||
      path === '/resume-question' || path === '/time/resume-question' ||
      path === '/skip-question' || path === '/time/skip-question' ||
      path === '/complete-question' || path === '/time/complete-question' ||
      path === '/skipped-questions' || path === '/time/skipped-questions' ||
      path === '/go-to-question' || path === '/time/go-to-question' ||
      path === '/game-summary' || path === '/time/game-summary' ||
      path.match(/^\/timer\/[^\/]+$/) || path.match(/^\/time\/timer\/[^\/]+$/);

    if (isTimeTrackingRoute) {
      const authResult = verifyAuth(req);
      if (authResult.error) {
        return res.status(authResult.status).json({ error: authResult.error, code: authResult.code });
      }

      var user = authResult.user;

      // Get user's team
      const { data: team } = await supabase
        .from('teams')
        .select('id, team_name, level, status, start_time, hints_used')
        .eq('user_id', user.userId)
        .single();

      if (!team) {
        return res.status(404).json({ error: 'Team not found' });
      }

      // ─── GET /api/game/timer/:puzzleId ───
      var timerMatch = path.match(/^(?:\/time)?\/timer\/([^\/]+)$/);
      if (req.method === 'GET' && timerMatch) {
        var timeSpent = 0;
        if (team.start_time) {
          timeSpent = Math.floor((Date.now() - new Date(team.start_time).getTime()) / 1000);
        }

        return res.json({
          timerState: {
            timeSpentSeconds: timeSpent,
            status: team.status === 'active' ? 'active' : 'not_started',
            isRunning: team.status === 'active',
            attempts: 0,
            hintsUsed: team.hints_used || 0,
            skipCount: 0,
            penaltySeconds: 0
          }
        });
      }

      // ─── GET /api/game/session OR /api/game/time/session ───
      if (req.method === 'GET' && (path === '/session' || path === '/time/session')) {
        var totalTime = 0;
        // Level 1: 40 minutes, Level 2: 60 minutes
        var TIME_LIMIT = (team.level === 2) ? (60 * 60) : (40 * 60);
        var timeRemaining = TIME_LIMIT;

        if (team.start_time) {
          totalTime = Math.floor((Date.now() - new Date(team.start_time).getTime()) / 1000);
          timeRemaining = Math.max(0, TIME_LIMIT - totalTime);
        }

        var hours = Math.floor(totalTime / 3600);
        var mins = Math.floor((totalTime % 3600) / 60);
        var secs = totalTime % 60;
        var formatted = String(hours).padStart(2, '0') + ':' + String(mins).padStart(2, '0') + ':' + String(secs).padStart(2, '0');

        // Fetch all puzzles for team's level
        const { data: puzzles } = await supabase
          .from('puzzles')
          .select('*')
          .eq('level', team.level || 1)
          .order('puzzle_number', { ascending: true });

        // Get ALL submissions for this team (correct and incorrect)
        const { data: submissions } = await supabase
          .from('submissions')
          .select('puzzle_id, submitted_answer, is_correct')
          .eq('team_id', team.id);

        const successfulPuzzles = new Map();
        const attemptedPuzzles = new Map();
        if (submissions) {
          submissions.forEach(function (sub) {
            if (sub.is_correct) {
              successfulPuzzles.set(sub.puzzle_id, sub.submitted_answer);
            } else {
              // Track attempted (wrong answer) puzzles too
              attemptedPuzzles.set(sub.puzzle_id, sub.submitted_answer);
            }
          });
        }

        // Map puzzles with status: completed > attempted > not_visited
        const puzzlesList = (puzzles || []).map(function (p) {
          const isCompleted = successfulPuzzles.has(p.id);
          const isAttempted = attemptedPuzzles.has(p.id);
          const submission = successfulPuzzles.get(p.id) || attemptedPuzzles.get(p.id);
          return {
            id: p.id,
            puzzle_number: p.puzzle_number,
            title: p.title,
            points: p.points,
            status: isCompleted ? 'completed' : isAttempted ? 'attempted' : 'not_visited',
            submitted_answer: submission || null
          };
        });

        return res.json({
          session: {
            totalTimeSeconds: totalTime,
            penaltySeconds: 0,
            effectiveTimeSeconds: totalTime,
            questionsCompleted: successfulPuzzles.size,
            questionsSkipped: 0,
            skipsRemaining: 3,
            totalTimeFormatted: formatted,
            timeRemainingSeconds: timeRemaining,
            timeLimitSeconds: TIME_LIMIT
          },
          puzzles: puzzlesList,
          time_remaining_seconds: timeRemaining,
          time_expired: timeRemaining <= 0
        });
      }

      // ─── POST /api/game/start-question OR /api/game/time/start-question ───
      if (req.method === 'POST' && (path === '/start-question' || path === '/time/start-question')) {
        if (!team.start_time) {
          await supabase
            .from('teams')
            .update({ start_time: new Date().toISOString(), status: 'active' })
            .eq('id', team.id);
        }
        return res.json({ success: true, message: 'Question timer started' });
      }

      // ─── POST /api/game/pause-question OR /api/game/time/pause-question ───
      if (req.method === 'POST' && (path === '/pause-question' || path === '/time/pause-question')) {
        await supabase.from('teams').update({ status: 'paused' }).eq('id', team.id);
        return res.json({ success: true, message: 'Question timer paused' });
      }

      // ─── POST /api/game/resume-question OR /api/game/time/resume-question ───
      if (req.method === 'POST' && (path === '/resume-question' || path === '/time/resume-question')) {
        await supabase.from('teams').update({ status: 'active' }).eq('id', team.id);
        return res.json({ success: true, message: 'Question timer resumed' });
      }

      // ─── POST /api/game/skip-question OR /api/game/time/skip-question ───
      if (req.method === 'POST' && (path === '/skip-question' || path === '/time/skip-question')) {
        const currentPuzzleId = req.body.puzzle_id;

        // Log the skip activity
        if (currentPuzzleId) {
          supabase.from('activity_logs').insert({
            id: crypto.randomUUID(),
            team_id: team.id,
            user_id: user.userId,
            action_type: 'question_skip',
            description: 'Skipped question',
            puzzle_id: currentPuzzleId
          }).then(function() {}).catch(function() {});
        }

        // Get all puzzles for current level
        const { data: puzzles } = await supabase
          .from('puzzles')
          .select('*')
          .eq('level', team.level || 1)
          .order('puzzle_number', { ascending: true });

        if (puzzles && puzzles.length > 0) {
          const currentIndex = puzzles.findIndex(function (p) { return p.id === currentPuzzleId; });
          const nextIndex = currentIndex >= 0 && currentIndex < puzzles.length - 1 ? currentIndex + 1 : 0;

          return res.json({
            success: true,
            message: 'Question skipped',
            next_puzzle: puzzles[nextIndex]
          });
        }

        return res.json({ success: true, message: 'Question skipped' });
      }

      // ─── POST /api/game/go-to-question OR /api/game/time/go-to-question ───
      if (req.method === 'POST' && (path === '/go-to-question' || path === '/time/go-to-question')) {
        const puzzleId = req.body.puzzle_id;

        if (!puzzleId) {
          return res.status(400).json({ error: 'puzzle_id required' });
        }

        // Verify puzzle exists
        const { data: puzzle } = await supabase
          .from('puzzles')
          .select('*')
          .eq('id', puzzleId)
          .single();

        if (!puzzle) {
          return res.status(404).json({ error: 'Puzzle not found' });
        }

        return res.json({
          success: true,
          message: 'Navigated to question',
          puzzle: puzzle
        });
      }

      // ─── POST /api/game/complete-question OR /api/game/time/complete-question ───
      if (req.method === 'POST' && (path === '/complete-question' || path === '/time/complete-question')) {
        const completePuzzleId = req.body.puzzle_id;

        // Log the completion activity
        if (completePuzzleId) {
          supabase.from('activity_logs').insert({
            id: crypto.randomUUID(),
            team_id: team.id,
            user_id: user.userId,
            action_type: 'question_complete',
            description: 'Completed question',
            puzzle_id: completePuzzleId
          }).then(function() {}).catch(function() {});
        }

        return res.json({ success: true, message: 'Question completed' });
      }

      // ─── GET /api/game/skipped-questions OR /api/game/time/skipped-questions ───
      if (req.method === 'GET' && (path === '/skipped-questions' || path === '/time/skipped-questions')) {
        return res.json({ skippedQuestions: [] });
      }

      // ─── GET /api/game/game-summary OR /api/game/time/game-summary ───
      if (req.method === 'GET' && (path === '/game-summary' || path === '/time/game-summary')) {
        // Get all puzzles for team's level
        const { data: allPuzzles } = await supabase
          .from('puzzles')
          .select('id, puzzle_number, title, level, points')
          .eq('level', team.level || 1)
          .eq('is_active', true)
          .order('puzzle_number', { ascending: true });

        // Get all submissions for this team
        const { data: submissions } = await supabase
          .from('submissions')
          .select('puzzle_id, submitted_answer, is_correct, submitted_at')
          .eq('team_id', team.id)
          .order('submitted_at', { ascending: false });

        // Build question summary
        const questionSummary = (allPuzzles || []).map(function (q) {
          const questionSubmissions = (submissions || []).filter(function (s) { return s.puzzle_id === q.id; });
          const correctSubmission = questionSubmissions.find(function (s) { return s.is_correct; });
          const latestSubmission = questionSubmissions[0];

          return {
            questionNumber: q.puzzle_number,
            title: q.title,
            level: q.level,
            points: q.points,
            attempted: questionSubmissions.length > 0,
            status: correctSubmission ? 'correct' : (latestSubmission ? 'wrong' : 'not_attempted'),
            attempts: questionSubmissions.length,
            submittedAnswer: latestSubmission ? latestSubmission.submitted_answer : null,
            isCorrect: !!correctSubmission,
            submittedAt: latestSubmission ? latestSubmission.submitted_at : null
          };
        });

        const totalQuestions = (allPuzzles || []).length;
        const attemptedQuestions = questionSummary.filter(function (q) { return q.attempted; }).length;
        const correctAnswers = questionSummary.filter(function (q) { return q.isCorrect; }).length;
        const wrongAnswers = attemptedQuestions - correctAnswers;
        const notAttempted = totalQuestions - attemptedQuestions;

        const startTime = team.start_time ? new Date(team.start_time) : null;
        const endTime = new Date();
        const totalTimeSeconds = startTime ? Math.floor((endTime - startTime) / 1000) : 0;

        return res.json({
          success: true,
          summary: {
            team: {
              id: team.id,
              name: team.team_name,
              level: team.level || 1,
              status: team.status,
              hintsUsed: team.hints_used || 0
            },
            stats: {
              totalQuestions: totalQuestions,
              attemptedQuestions: attemptedQuestions,
              correctAnswers: correctAnswers,
              wrongAnswers: wrongAnswers,
              notAttempted: notAttempted,
              totalTimeSeconds: totalTimeSeconds,
              qualificationThreshold: 8,
              qualified: correctAnswers >= 8
            },
            questions: questionSummary
          }
        });
      }

      return res.status(404).json({ error: 'Time tracking endpoint not found' });
    }

    // ─── GET /api/game/broadcast — Fetch broadcast messages (team auth) ───
    if (req.method === 'GET' && path === '/broadcast') {
      const authResult = verifyAuth(req);
      if (authResult.error) {
        return res.status(authResult.status).json({ error: authResult.error, code: authResult.code });
      }

      const { data: broadcasts, error: bErr } = await supabase
        .from('broadcasts')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(10);

      if (bErr) throw bErr;

      // Filter out expired messages
      const now = new Date();
      const activeMessages = (broadcasts || []).filter(function (b) {
        if (!b.expires_at) return true;
        return new Date(b.expires_at) > now;
      });

      return res.json({ messages: activeMessages });
    }

    // ─── Protected admin routes below ───
    const authResult = verifyAuth(req);
    if (authResult.error) {
      return res.status(authResult.status).json({ error: authResult.error, code: authResult.code });
    }
    const adminCheck = requireAdmin(authResult.user);
    if (adminCheck) {
      return res.status(adminCheck.status).json({ error: adminCheck.error });
    }

    // ─── POST /api/game/start ───
    if (req.method === 'POST' && path === '/start') {
      const gameStateId = await getGameStateId(supabase);
      const now = new Date().toISOString();

      // Update game state
      const { error } = await supabase
        .from('game_state')
        .update({ game_active: true, game_started_at: now })
        .eq('id', gameStateId);
      if (error) throw error;

      // Update all waiting and qualified teams to active status
      const { error: teamError } = await supabase
        .from('teams')
        .update({ status: 'active', start_time: now })
        .in('status', ['waiting', 'qualified']);
      if (teamError) throw teamError;

      return res.json({ message: 'Game started' });
    }

    // ─── POST /api/game/pause ───
    if (req.method === 'POST' && path === '/pause') {
      const gameStateId = await getGameStateId(supabase);
      const { error } = await supabase
        .from('game_state')
        .update({ game_active: false })
        .eq('id', gameStateId);
      if (error) throw error;
      return res.json({ message: 'Game paused' });
    }

    // ─── POST /api/game/resume ───
    if (req.method === 'POST' && path === '/resume') {
      const gameStateId = await getGameStateId(supabase);
      const { error } = await supabase
        .from('game_state')
        .update({ game_active: true })
        .eq('id', gameStateId);
      if (error) throw error;
      return res.json({ message: 'Game resumed' });
    }

    // ─── POST /api/game/end ───
    if (req.method === 'POST' && path === '/end') {
      const gameStateId = await getGameStateId(supabase);
      const { error } = await supabase
        .from('game_state')
        .update({ game_active: false, game_ended_at: new Date().toISOString() })
        .eq('id', gameStateId);
      if (error) throw error;
      return res.json({ message: 'Game ended' });
    }

    // ─── POST /api/game/reset or /restart ───
    if (req.method === 'POST' && (path === '/reset' || path === '/restart')) {
      const gameStateId = await getGameStateId(supabase);
      const { error: gsErr } = await supabase
        .from('game_state')
        .update({
          game_active: false,
          current_level: 1,
          level1_open: true,
          level2_open: false,
          game_started_at: null,
          game_ended_at: null
        })
        .eq('id', gameStateId);
      if (gsErr) {
        console.error('Game state reset error:', gsErr);
        throw gsErr;
      }

      // Reset all teams - including start_time to clear timer
      // Note: teams table has: level, status, progress, hints_used, start_time, end_time
      const { error: tErr } = await supabase
        .from('teams')
        .update({
          level: 1,
          status: 'waiting',
          progress: 0,
          hints_used: 0,
          start_time: null,
          end_time: null
        })
        .not('id', 'is', null); // update all rows
      if (tErr) {
        console.error('Team reset error:', tErr);
        // Continue anyway - non-critical
      }

      // Clear all submissions - use try/catch to handle empty table
      try {
        await supabase
          .from('submissions')
          .delete()
          .not('id', 'is', null);
      } catch (e) {
        console.log('Submissions clear (may be empty):', e);
      }

      // Clear team_puzzles progress
      try {
        await supabase
          .from('team_puzzles')
          .delete()
          .not('id', 'is', null);
      } catch (e) {
        console.log('Team puzzles clear (may be empty):', e);
      }

      // Clear level evaluation states
      try {
        await supabase
          .from('level_evaluation_state')
          .update({
            evaluation_state: 'IN_PROGRESS',
            evaluation_started_at: null,
            evaluated_at: null,
            results_published_at: null
          })
          .not('id', 'is', null);
      } catch (e) {
        console.log('Level evaluation flush:', e);
      }

      // Clear team level status records
      try {
        await supabase
          .from('team_level_status')
          .delete()
          .not('id', 'is', null);
      } catch (e) {
        console.log('Team level status wipe:', e);
      }

      // Clear activity logs 
      try {
        await supabase
          .from('activity_logs')
          .delete()
          .not('id', 'is', null);
      } catch (e) {
        console.log('Activity logs wipe:', e);
      }

      // Update game state for overall results flag
      try {
        await supabase
          .from('game_state')
          .update({ results_published: false })
          .eq('id', gameStateId);
      } catch (e) {
        console.log('Game state results flush:', e);
      }

      return res.json({ message: 'Game reset - all progress cleared' });
    }

    // ─── POST /api/game/level2/unlock ───
    if (req.method === 'POST' && path === '/level2/unlock') {
      const gameStateId = await getGameStateId(supabase);

      // Get current state
      const { data: gameState } = await supabase
        .from('game_state')
        .select('*')
        .eq('id', gameStateId)
        .single();

      const now = new Date().toISOString();
      const updates = {
        current_level: 2,
        level2_open: true
      };

      // If level 1 not started, start it along with level 2
      if (!gameState?.level1_open) {
        updates.level1_open = true;
        updates.game_active = true;
        updates.game_started_at = gameState?.game_started_at || now;
      }

      const { error } = await supabase
        .from('game_state')
        .update(updates)
        .eq('id', gameStateId);
      if (error) throw error;
      return res.json({ success: true, message: 'Level 2 unlocked successfully!' });
    }

    // ─── POST /api/game/level/unlock ───
    if (req.method === 'POST' && path === '/level/unlock') {
      const { level } = req.body;
      const updates = { current_level: level };
      if (level === 1) updates.level1_open = true;
      if (level === 2) updates.level2_open = true;

      const gameStateId = await getGameStateId(supabase);
      const { error } = await supabase
        .from('game_state')
        .update(updates)
        .eq('id', gameStateId);
      if (error) throw error;
      return res.json({ message: `Level ${level} unlocked` });
    }

    // ─── POST /api/game/broadcast ───
    if (req.method === 'POST' && path === '/broadcast') {
      const { message, type } = req.body;
      const { error } = await supabase.from('broadcasts').insert({
        id: crypto.randomUUID(),
        message,
        type: type || 'info',
        created_at: new Date().toISOString()
      });
      if (error) throw error;
      return res.json({ message: 'Broadcast sent' });
    }

    return res.status(404).json({ error: 'Endpoint not found' });

  } catch (error) {
    console.error('Game API error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
};
