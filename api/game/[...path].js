const crypto = require('crypto');
const { getSupabase } = require('../_lib/supabase');
const { verifyAuth, requireAdmin, setCorsHeaders } = require('../_lib/auth');

// Cache game_state ID to avoid repeated lookups (singleton table)
let cachedGameStateId = null;

async function getGameStateId(supabase) {
  if (cachedGameStateId) return cachedGameStateId;
  
  const { data } = await supabase.from('game_state').select('id').limit(1).single();
  if (data && data.id) {
    cachedGameStateId = data.id;
    return cachedGameStateId;
  }
  
  // Fallback to ID 1 for initial setup
  return 1;
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
          game_ended_at: null
        });
      }

      return res.json(states[0]);
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
        .select('id, team_name, status, start_time, hints_used')
        .eq('user_id', user.userId)
        .single();

      if (!team) {
        return res.status(404).json({ error: 'Team not found' });
      }

      // ─── GET /api/game/timer/:puzzleId ───
      var timerMatch = path.match(/^\/timer\/([^\/]+)$/);
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
        if (team.start_time) {
          totalTime = Math.floor((Date.now() - new Date(team.start_time).getTime()) / 1000);
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
        
        // Get submissions for this team
        const { data: submissions } = await supabase
          .from('submissions')
          .select('puzzle_id, is_correct')
          .eq('team_id', team.id);
        
        const successfulPuzzles = new Set();
        if (submissions) {
          submissions.forEach(function(sub) {
            if (sub.is_correct) successfulPuzzles.add(sub.puzzle_id);
          });
        }
        
        // Map puzzles with status
        const puzzlesList = (puzzles || []).map(function(p) {
          const isCompleted = successfulPuzzles.has(p.id);
          return {
            id: p.id,
            puzzle_number: p.puzzle_number,
            title: p.title,
            points: p.points,
            status: isCompleted ? 'completed' : 'not_visited'
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
            totalTimeFormatted: formatted
          },
          puzzles: puzzlesList
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
        // Get all puzzles for current level
        const { data: puzzles } = await supabase
          .from('puzzles')
          .select('*')
          .eq('level', team.level || 1)
          .order('puzzle_number', { ascending: true });
        
        if (puzzles && puzzles.length > 0) {
          // Find current puzzle and next puzzle
          const currentPuzzleId = req.body.puzzle_id;
          const currentIndex = puzzles.findIndex(function(p) { return p.id === currentPuzzleId; });
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
        return res.json({ success: true, message: 'Question completed' });
      }

      // ─── GET /api/game/skipped-questions OR /api/game/time/skipped-questions ───
      if (req.method === 'GET' && (path === '/skipped-questions' || path === '/time/skipped-questions')) {
        return res.json({ skippedQuestions: [] });
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
      const activeMessages = (broadcasts || []).filter(function(b) {
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
      if (gsErr) throw gsErr;

      // Reset all teams
      const { error: tErr } = await supabase
        .from('teams')
        .update({ level: 1, status: 'waiting' })
        .neq('id', '00000000-0000-0000-0000-000000000000'); // update all rows
      if (tErr) throw tErr;

      return res.json({ message: 'Game reset' });
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
