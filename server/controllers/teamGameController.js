const db = require('../config/db');
const { supabaseAdmin } = require('../config/supabase');
const { v4: uuidv4 } = require('uuid');

const USE_SUPABASE = process.env.USE_SUPABASE === 'true';

// Level time limits in seconds (40 minutes = 2400 seconds)
const LEVEL_TIME_LIMITS = {
  1: 40 * 60, // 40 minutes for Level 1
  2: 60 * 60  // 60 minutes for Level 2 (can be adjusted)
};

/**
 * Check if team has exceeded time limit for their current level
 */
async function checkTeamTimeLimit(teamId) {
  try {
    let teamData;
    if (USE_SUPABASE) {
      const { data, error } = await supabaseAdmin
        .from('teams')
        .select('level, status, start_time, end_time')
        .eq('id', teamId)
        .single();
      if (error || !data) return { expired: false, remainingSeconds: 0, elapsedSeconds: 0, error: 'Team not found' };
      teamData = data;
    } else {
      const [team] = await db.query('SELECT level, status, start_time, end_time FROM teams WHERE id = ?', [teamId]);
      if (team.length === 0) return { expired: false, remainingSeconds: 0, elapsedSeconds: 0, error: 'Team not found' };
      teamData = team[0];
    }

    if (teamData.status === 'completed' || teamData.status === 'disqualified') {
      return { expired: false, remainingSeconds: 0, elapsedSeconds: 0, status: teamData.status };
    }
    if (!teamData.start_time) {
      const timeLimit = LEVEL_TIME_LIMITS[teamData.level] || LEVEL_TIME_LIMITS[1];
      return { expired: false, remainingSeconds: timeLimit, elapsedSeconds: 0 };
    }

    const startTime = new Date(teamData.start_time);
    const now = new Date();
    const elapsedSeconds = Math.floor((now - startTime) / 1000);
    const timeLimit = LEVEL_TIME_LIMITS[teamData.level] || LEVEL_TIME_LIMITS[1];
    const remainingSeconds = Math.max(0, timeLimit - elapsedSeconds);

    return { expired: elapsedSeconds >= timeLimit, remainingSeconds, elapsedSeconds, timeLimit, level: teamData.level };
  } catch (err) {
    console.error('checkTeamTimeLimit error:', err.message);
    return { expired: false, remainingSeconds: 2400, elapsedSeconds: 0 };
  }
}

/**
 * Auto-end game for team when time expires
 */
async function autoEndGameForTeam(teamId) {
  if (USE_SUPABASE) {
    await supabaseAdmin.from('teams').update({ status: 'completed', end_time: new Date().toISOString() }).eq('id', teamId).eq('status', 'active');
    await supabaseAdmin.from('activity_logs').insert({
      id: uuidv4(), team_id: teamId, action_type: 'level_complete', type: 'level_complete',
      description: 'Time limit reached - game auto-ended', message: 'Time limit reached - game auto-ended'
    });
  } else {
    await db.query(`UPDATE teams SET status = 'completed', end_time = NOW() WHERE id = ? AND status = 'active'`, [teamId]);
    await db.query(`INSERT INTO activity_logs (id, team_id, action_type, description) VALUES (?, ?, 'level_complete', 'Time limit reached - game auto-ended')`, [uuidv4(), teamId]);
  }
}

// Get current puzzle for team
exports.getCurrentPuzzle = async (req, res) => {
  try {
    const teamId = req.user.team_id;
    if (!teamId) {
      return res.status(400).json({ success: false, message: 'Team ID not found in token' });
    }

    if (!USE_SUPABASE) {
      // MySQL path - keep original logic
      return res.status(500).json({ success: false, message: 'MySQL not supported' });
    }

    // Get team info
    const { data: teamData, error: teamErr } = await supabaseAdmin
      .from('teams')
      .select('level, status, progress')
      .eq('id', teamId)
      .single();

    if (teamErr || !teamData) {
      return res.status(404).json({ success: false, message: 'Team not found' });
    }

    // Try to find the currently IN_PROGRESS puzzle from team_question_progress
    let currentPuzzleId = null;
    try {
      const { data: inProgressRecords } = await supabaseAdmin
        .from('team_question_progress')
        .select('puzzle_id')
        .eq('team_id', teamId)
        .eq('status', 'IN_PROGRESS')
        .order('updated_at', { ascending: false })
        .limit(1);
      currentPuzzleId = inProgressRecords?.[0]?.puzzle_id || null;
    } catch (e) {
      console.log('team_question_progress lookup error:', e.message);
    }

    if (teamData.status === 'disqualified') {
      return res.json({ success: true, message: 'Team has been disqualified', puzzle: null, team_status: 'disqualified' });
    }
    if (teamData.status === 'completed') {
      return res.json({ success: true, message: 'Team has completed the game', puzzle: null, team_status: 'completed', game_completed: true });
    }

    // Check time limit
    const timeCheck = await checkTeamTimeLimit(teamId);
    if (timeCheck.expired) {
      await autoEndGameForTeam(teamId);
      return res.json({
        success: true, message: 'Time limit reached!', puzzle: null,
        team_status: 'completed', game_completed: true, time_expired: true,
        elapsed_seconds: timeCheck.elapsedSeconds, time_limit_seconds: timeCheck.timeLimit
      });
    }

    const currentLevel = teamData.level || 1;
    let puzzle = null;

    // If team has a current_puzzle_id, use it
    if (currentPuzzleId) {
      const { data: cp } = await supabaseAdmin
        .from('puzzles')
        .select('id, level, puzzle_number, title, description, puzzle_type, puzzle_content, puzzle_file_url, points, time_limit_minutes')
        .eq('id', currentPuzzleId)
        .eq('is_active', true)
        .single();
      if (cp) puzzle = cp;
    }

    // Fallback: calculate from completed puzzles
    if (!puzzle) {
      // Get completed puzzle IDs from both team_question_progress and team_progress
      let completedPuzzleIds = [];
      try {
        const { data: completedTQP } = await supabaseAdmin
          .from('team_question_progress')
          .select('puzzle_id')
          .eq('team_id', teamId)
          .eq('status', 'COMPLETED');
        completedPuzzleIds.push(...(completedTQP || []).map(p => p.puzzle_id));
      } catch (e) {}
      try {
        const { data: completedTP } = await supabaseAdmin
          .from('team_progress')
          .select('puzzle_id')
          .eq('team_id', teamId)
          .eq('is_completed', true);
        completedPuzzleIds.push(...(completedTP || []).map(p => p.puzzle_id));
      } catch (e) {}

      const completedSet = new Set(completedPuzzleIds);

      // Get next uncompleted puzzle at current level
      let query = supabaseAdmin
        .from('puzzles')
        .select('id, level, puzzle_number, title, description, puzzle_type, puzzle_content, puzzle_file_url, points, time_limit_minutes')
        .eq('level', currentLevel)
        .eq('is_active', true)
        .order('puzzle_number', { ascending: true });

      const { data: levelPuzzles } = await query;

      // Find first uncompleted puzzle
      if (levelPuzzles) {
        puzzle = levelPuzzles.find(p => !completedSet.has(p.id)) || null;
      }

      // If found a fallback puzzle, mark it as IN_PROGRESS so navigation persists
      if (puzzle) {
        try {
          // Clear any stale IN_PROGRESS records first
          await supabaseAdmin
            .from('team_question_progress')
            .update({ status: 'NOT_STARTED', updated_at: new Date().toISOString() })
            .eq('team_id', teamId)
            .eq('status', 'IN_PROGRESS');

          // Mark this puzzle as IN_PROGRESS
          const { data: existingProgress } = await supabaseAdmin
            .from('team_question_progress')
            .select('id')
            .eq('team_id', teamId)
            .eq('puzzle_id', puzzle.id);

          if (!existingProgress || existingProgress.length === 0) {
            await supabaseAdmin.from('team_question_progress').insert({
              id: uuidv4(), team_id: teamId, puzzle_id: puzzle.id,
              status: 'IN_PROGRESS', started_at: new Date().toISOString()
            });
          } else {
            await supabaseAdmin.from('team_question_progress')
              .update({ status: 'IN_PROGRESS', updated_at: new Date().toISOString() })
              .eq('team_id', teamId)
              .eq('puzzle_id', puzzle.id);
          }
        } catch (e) {
          console.log('Error setting initial IN_PROGRESS:', e.message);
        }
      }
    }

    if (!puzzle) {
      // Check next level
      const { data: nextLevelPuzzles } = await supabaseAdmin
        .from('puzzles')
        .select('id, level, puzzle_number, title, description, puzzle_type, puzzle_content, puzzle_file_url, points, time_limit_minutes')
        .gt('level', currentLevel)
        .eq('is_active', true)
        .order('level', { ascending: true })
        .order('puzzle_number', { ascending: true })
        .limit(1);

      if (!nextLevelPuzzles || nextLevelPuzzles.length === 0) {
        return res.json({ success: true, message: 'All puzzles completed!', puzzle: null, game_completed: true });
      }

      // Check if next level is unlocked
      try {
        const { data: gameState } = await supabaseAdmin.from('game_state').select('level2_open').limit(1);
        if (nextLevelPuzzles[0].level === 2 && !gameState?.[0]?.level2_open) {
          return res.json({ success: true, message: 'Level 1 completed! Waiting for Level 2 to unlock.', puzzle: null, waiting_for_level: 2 });
        }
      } catch (e) { /* game_state may not exist */ }

      puzzle = nextLevelPuzzles[0];
    }

    if (!puzzle) {
      return res.json({ success: true, message: 'No puzzle available', puzzle: null });
    }

    // Get/create team progress for this puzzle
    const { data: progress } = await supabaseAdmin
      .from('team_progress')
      .select('started_at, attempts, hints_used')
      .eq('team_id', teamId)
      .eq('puzzle_id', puzzle.id);

    if (!progress || progress.length === 0) {
      await supabaseAdmin.from('team_progress').insert({
        id: uuidv4(), team_id: teamId, puzzle_id: puzzle.id,
        current_level: puzzle.level, current_puzzle: puzzle.puzzle_number
      });
    }

    // Set start_time if not set
    await supabaseAdmin.from('teams')
      .update({ start_time: new Date().toISOString(), status: 'active' })
      .eq('id', teamId)
      .is('start_time', null);

    // Get hints info
    const { data: allHints } = await supabaseAdmin
      .from('hints')
      .select('id, hint_number, time_penalty_seconds')
      .eq('puzzle_id', puzzle.id)
      .eq('is_active', true)
      .order('hint_number');

    const { data: usedHints } = await supabaseAdmin
      .from('hint_usage')
      .select('hint_id')
      .eq('team_id', teamId)
      .eq('puzzle_id', puzzle.id);

    const usedHintIds = (usedHints || []).map(h => h.hint_id);
    const availableHints = (allHints || []).filter(h => !usedHintIds.includes(h.id));

    const currentTimeCheck = await checkTeamTimeLimit(teamId);

    res.json({
      success: true,
      puzzle: {
        ...puzzle,
        progress: (progress && progress[0]) || { attempts: 0, hints_used: 0 },
        available_hints: availableHints.length,
        total_hints: (allHints || []).length
      },
      time_remaining_seconds: currentTimeCheck.remainingSeconds,
      time_elapsed_seconds: currentTimeCheck.elapsedSeconds,
      time_limit_seconds: currentTimeCheck.timeLimit || LEVEL_TIME_LIMITS[1]
    });
  } catch (error) {
    console.error('Error fetching current puzzle:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch puzzle', error: error.message });
  }
};

// Submit puzzle answer
exports.submitAnswer = async (req, res) => {
  try {
    const teamId = req.user.team_id;
    const { puzzle_id, answer } = req.body;

    console.log('Submit answer request:', { teamId, puzzle_id, answer: answer?.substring(0, 20) });

    if (!puzzle_id || !answer) {
      return res.status(400).json({ success: false, message: 'puzzle_id and answer are required' });
    }
    if (!teamId) {
      return res.status(400).json({ success: false, message: 'Team ID not found in token' });
    }

    if (!USE_SUPABASE) {
      return res.status(500).json({ success: false, message: 'MySQL not supported' });
    }

    // Check team status
    const { data: teamData } = await supabaseAdmin
      .from('teams').select('status, level').eq('id', teamId).single();

    if (!teamData) return res.status(404).json({ success: false, message: 'Team not found' });
    if (teamData.status === 'disqualified') return res.status(403).json({ success: false, message: 'Team has been disqualified' });

    // Check time limit
    const timeCheck = await checkTeamTimeLimit(teamId);
    if (timeCheck.expired) {
      await autoEndGameForTeam(teamId);
      return res.status(403).json({ success: false, message: 'Time limit reached!', time_expired: true });
    }

    // Check if game is paused (game_active = false means paused/stopped)
    try {
      const { data: gs } = await supabaseAdmin.from('game_state').select('game_active').limit(1);
      if (gs?.[0] && gs[0].game_active === false) return res.status(403).json({ success: false, message: 'Game is currently paused' });
    } catch (e) { /* game_state may not exist */ }

    // Get puzzle details
    const { data: puzzleData } = await supabaseAdmin
      .from('puzzles')
      .select('correct_answer, level, puzzle_number, points')
      .eq('id', puzzle_id)
      .single();

    if (!puzzleData) return res.status(404).json({ success: false, message: 'Puzzle not found' });

    // Get progress
    const { data: progressArr } = await supabaseAdmin
      .from('team_progress')
      .select('started_at, attempts')
      .eq('team_id', teamId)
      .eq('puzzle_id', puzzle_id);

    const progressData = progressArr?.[0];
    const timeTaken = progressData?.started_at
      ? Math.floor((Date.now() - new Date(progressData.started_at).getTime()) / 1000)
      : 0;

    // Check answer
    const isCorrect = answer.trim().toLowerCase() === puzzleData.correct_answer.trim().toLowerCase();

    // Record submission
    await supabaseAdmin.from('submissions').insert({
      id: uuidv4(), team_id: teamId, puzzle_id: puzzle_id,
      submitted_answer: answer, is_correct: isCorrect, time_taken_seconds: timeTaken,
      evaluation_status: 'PENDING'
    });

    // Update attempts
    await supabaseAdmin.from('team_progress')
      .update({ attempts: (progressData?.attempts || 0) + 1 })
      .eq('team_id', teamId).eq('puzzle_id', puzzle_id);

    // Log activity
    await supabaseAdmin.from('activity_logs').insert({
      id: uuidv4(), team_id: teamId, user_id: req.user.id,
      action_type: isCorrect ? 'puzzle_solve' : 'puzzle_fail',
      type: isCorrect ? 'puzzle_solve' : 'puzzle_fail',
      description: isCorrect ? 'Correct answer submitted' : 'Answer submitted',
      message: isCorrect ? 'Correct answer submitted' : 'Answer submitted',
      puzzle_id: puzzle_id
    });

    // Set start_time if not set
    await supabaseAdmin.from('teams')
      .update({ start_time: new Date().toISOString() })
      .eq('id', teamId).is('start_time', null);

    if (isCorrect) {
      // Update team_question_progress
      try {
        const { data: existingTqp } = await supabaseAdmin
          .from('team_question_progress').select('id').eq('team_id', teamId).eq('puzzle_id', puzzle_id);

        if (existingTqp && existingTqp.length > 0) {
          await supabaseAdmin.from('team_question_progress')
            .update({ status: 'COMPLETED', completed_at: new Date().toISOString(), updated_at: new Date().toISOString() })
            .eq('team_id', teamId).eq('puzzle_id', puzzle_id);
        } else {
          await supabaseAdmin.from('team_question_progress').insert({
            id: uuidv4(), team_id: teamId, puzzle_id: puzzle_id,
            status: 'COMPLETED', completed_at: new Date().toISOString(), correct: true
          });
        }
      } catch (e) { console.log('team_question_progress error:', e.message); }

      // Update team_sessions stats
      try {
        await supabaseAdmin.rpc('increment_field', { row_id: teamId, table_name: 'team_sessions', field_name: 'questions_completed' });
      } catch (e) { /* may not exist */ }

      // Update team_progress
      await supabaseAdmin.from('team_progress')
        .update({ is_completed: true, completed_at: new Date().toISOString() })
        .eq('team_id', teamId).eq('puzzle_id', puzzle_id);

      // Calculate progress
      const { data: totalPuzzles } = await supabaseAdmin
        .from('puzzles').select('id').eq('level', puzzleData.level).eq('is_active', true);
      const { data: completedPuzzles } = await supabaseAdmin
        .from('team_progress').select('id').eq('team_id', teamId).eq('is_completed', true);

      const totalCount = totalPuzzles?.length || 1;
      // Count completed in this level
      const completedInLevel = (completedPuzzles || []).length;
      const levelProgress = Math.round((completedInLevel / totalCount) * 100);
      await supabaseAdmin.from('teams').update({ progress: levelProgress }).eq('id', teamId);

      // Get next puzzle
      const { data: nextPuzzles } = await supabaseAdmin
        .from('puzzles')
        .select('id, level, puzzle_number, title')
        .eq('is_active', true)
        .or(`and(level.eq.${puzzleData.level},puzzle_number.gt.${puzzleData.puzzle_number}),level.gt.${puzzleData.level}`)
        .order('level', { ascending: true })
        .order('puzzle_number', { ascending: true })
        .limit(1);

      if (nextPuzzles && nextPuzzles.length > 0) {
        return res.json({
          success: true, is_correct: true, message: 'Correct answer!',
          points_earned: puzzleData.points, time_taken: timeTaken, next_puzzle: nextPuzzles[0]
        });
      } else {
        // Game completed
        await supabaseAdmin.from('teams')
          .update({ status: 'completed', end_time: new Date().toISOString(), progress: 100 })
          .eq('id', teamId);

        return res.json({
          success: true, is_correct: true,
          message: 'Congratulations! You have completed all puzzles!',
          game_completed: true, points_earned: puzzleData.points, time_taken: timeTaken
        });
      }
    } else {
      const attemptNumber = progressData ? (progressData.attempts + 1) : 1;
      return res.json({
        success: true, is_correct: false,
        message: 'Incorrect answer. Try again!', attempt_number: attemptNumber
      });
    }
  } catch (error) {
    console.error('Error submitting answer:', error);
    res.status(500).json({ success: false, message: 'Failed to submit answer' });
  }
};

// Request hint
exports.requestHint = async (req, res) => {
  try {
    const teamId = req.user.team_id;
    const { puzzle_id } = req.body;

    if (!puzzle_id) {
      return res.status(400).json({ success: false, message: 'puzzle_id is required' });
    }

    if (!USE_SUPABASE) {
      return res.status(500).json({ success: false, message: 'MySQL not supported' });
    }

    // Get all active hints for this puzzle
    const { data: allHints } = await supabaseAdmin
      .from('hints').select('*').eq('puzzle_id', puzzle_id).eq('is_active', true).order('hint_number');

    // Get used hints
    const { data: usedHints } = await supabaseAdmin
      .from('hint_usage').select('hint_id').eq('team_id', teamId).eq('puzzle_id', puzzle_id);

    const usedHintIds = (usedHints || []).map(h => h.hint_id);
    const availableHints = (allHints || []).filter(h => !usedHintIds.includes(h.id));

    if (availableHints.length === 0) {
      return res.status(400).json({ success: false, message: 'No more hints available for this puzzle' });
    }

    const nextHint = availableHints[0];

    // Record hint usage
    await supabaseAdmin.from('hint_usage').insert({
      id: uuidv4(), team_id: teamId, hint_id: nextHint.id,
      puzzle_id: puzzle_id, time_penalty_applied: nextHint.time_penalty_seconds
    });

    // Update team hints count
    const { data: teamRow } = await supabaseAdmin.from('teams').select('hints_used').eq('id', teamId).single();
    await supabaseAdmin.from('teams').update({ hints_used: (teamRow?.hints_used || 0) + 1 }).eq('id', teamId);

    // Update progress hints count
    const { data: progRow } = await supabaseAdmin.from('team_progress').select('hints_used').eq('team_id', teamId).eq('puzzle_id', puzzle_id).single();
    if (progRow) {
      await supabaseAdmin.from('team_progress').update({ hints_used: (progRow.hints_used || 0) + 1 }).eq('team_id', teamId).eq('puzzle_id', puzzle_id);
    }

    // Log activity
    await supabaseAdmin.from('activity_logs').insert({
      id: uuidv4(), team_id: teamId, user_id: req.user.id,
      action_type: 'hint_use', type: 'hint_used',
      description: `Used hint ${nextHint.hint_number}`, message: `Used hint ${nextHint.hint_number}`,
      puzzle_id: puzzle_id
    });

    res.json({
      success: true,
      hint: { hint_number: nextHint.hint_number, hint_text: nextHint.hint_text, time_penalty_seconds: nextHint.time_penalty_seconds },
      remaining_hints: availableHints.length - 1
    });
  } catch (error) {
    console.error('Error requesting hint:', error);
    res.status(500).json({ success: false, message: 'Failed to get hint' });
  }
};

// Get team progress
exports.getTeamProgress = async (req, res) => {
  try {
    const teamId = req.user.team_id;

    if (!teamId) {
      return res.status(400).json({ success: false, message: 'Team ID not found in token' });
    }

    if (!USE_SUPABASE) {
      return res.status(500).json({ success: false, message: 'MySQL not supported' });
    }

    const { data: teamData } = await supabaseAdmin
      .from('teams')
      .select('team_name, level, progress, hints_used, status, start_time, end_time')
      .eq('id', teamId).single();

    if (!teamData) {
      return res.status(404).json({ success: false, message: 'Team not found' });
    }

    // Get completed puzzles count
    let completedCount = 0;
    try {
      const { data: completed } = await supabaseAdmin
        .from('team_question_progress').select('id').eq('team_id', teamId).eq('status', 'completed');
      completedCount = completed?.length || 0;
    } catch (err) {
      const { data: completed } = await supabaseAdmin
        .from('team_progress').select('id').eq('team_id', teamId).eq('is_completed', true);
      completedCount = completed?.length || 0;
    }

    // Get total puzzles
    const { data: totalPuzzles } = await supabaseAdmin
      .from('puzzles').select('id').eq('is_active', true);
    const totalCount = totalPuzzles?.length || 0;

    const calculatedProgress = totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0;

    // Get hints used
    let hintsUsed = teamData.hints_used || 0;
    try {
      const { data: hintData } = await supabaseAdmin
        .from('team_question_progress').select('hints_used').eq('team_id', teamId);
      const totalHints = (hintData || []).reduce((sum, r) => sum + (r.hints_used || 0), 0);
      if (totalHints > 0) hintsUsed = totalHints;
    } catch (err) { /* use team value */ }

    // Calculate time elapsed
    let timeElapsed = 0;
    if (teamData.start_time) {
      const endTime = teamData.end_time ? new Date(teamData.end_time) : new Date();
      timeElapsed = Math.floor((endTime - new Date(teamData.start_time)) / 1000);
    }

    // Get per-question stats
    let questionStats = [];
    try {
      const { data: tqpData } = await supabaseAdmin
        .from('team_question_progress').select('puzzle_id, status, attempts, hints_used, time_spent_seconds, skip_count')
        .eq('team_id', teamId);

      if (tqpData && tqpData.length > 0) {
        const puzzleIds = tqpData.map(t => t.puzzle_id);
        const { data: puzzleData } = await supabaseAdmin
          .from('puzzles').select('id, title, level, puzzle_number').in('id', puzzleIds);

        const puzzleMap = {};
        (puzzleData || []).forEach(p => { puzzleMap[p.id] = p; });

        questionStats = tqpData.map(t => ({
          puzzle_id: t.puzzle_id,
          puzzle_title: puzzleMap[t.puzzle_id]?.title || 'Unknown',
          level: puzzleMap[t.puzzle_id]?.level || 1,
          puzzle_number: puzzleMap[t.puzzle_id]?.puzzle_number || 0,
          status: t.status,
          attempts: t.attempts,
          question_hints_used: t.hints_used,
          time_spent_seconds: t.time_spent_seconds,
          skip_count: t.skip_count
        })).sort((a, b) => a.level - b.level || a.puzzle_number - b.puzzle_number);
      }
    } catch (err) { /* table might not exist */ }

    res.json({
      success: true,
      progress: {
        team_name: teamData.team_name,
        current_level: teamData.level || 1,
        progress: calculatedProgress,
        hints_used: hintsUsed,
        status: teamData.status,
        start_time: teamData.start_time,
        end_time: teamData.end_time,
        completed_puzzles: completedCount,
        total_puzzles: totalCount,
        time_elapsed_seconds: timeElapsed,
        question_stats: questionStats
      }
    });
  } catch (error) {
    console.error('Error fetching progress:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch progress', error: error.message });
  }
};

// Get team inventory
exports.getInventory = async (req, res) => {
  try {
    const teamId = req.user.team_id;

    if (!USE_SUPABASE) {
      return res.status(500).json({ success: false, message: 'MySQL not supported' });
    }

    const { data: items } = await supabaseAdmin
      .from('inventory')
      .select('id, item_type, item_name, item_value, collected_at, is_used')
      .eq('team_id', teamId)
      .order('collected_at', { ascending: false });

    res.json({ success: true, inventory: items || [] });
  } catch (error) {
    console.error('Error fetching inventory:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch inventory' });
  }
};

// Add item to inventory
exports.addInventoryItem = async (req, res) => {
  try {
    const teamId = req.user.team_id;
    const { item_type, item_name, item_value, puzzle_id } = req.body;

    if (!item_name) {
      return res.status(400).json({ success: false, message: 'item_name is required' });
    }

    if (!USE_SUPABASE) {
      return res.status(500).json({ success: false, message: 'MySQL not supported' });
    }

    await supabaseAdmin.from('inventory').insert({
      id: uuidv4(), team_id: teamId, item_type: item_type || 'clue',
      item_name: item_name, item_value: item_value, collected_from_puzzle: puzzle_id || null
    });

    res.json({ success: true, message: 'Item added to inventory' });
  } catch (error) {
    console.error('Error adding inventory item:', error);
    res.status(500).json({ success: false, message: 'Failed to add item' });
  }
};

// Get activity logs for team
exports.getActivityLogs = async (req, res) => {
  try {
    const teamId = req.user.team_id;

    if (!USE_SUPABASE) {
      return res.status(500).json({ success: false, message: 'MySQL not supported' });
    }

    const { data: logs } = await supabaseAdmin
      .from('activity_logs')
      .select('action_type, description, created_at')
      .eq('team_id', teamId)
      .order('created_at', { ascending: false })
      .limit(50);

    res.json({ success: true, logs: logs || [] });
  } catch (error) {
    console.error('Error fetching logs:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch logs' });
  }
};

// Get game summary with all responses before ending
exports.getGameSummary = async (req, res) => {
  try {
    const teamId = req.user.team_id;

    if (!USE_SUPABASE) {
      return res.status(500).json({ success: false, message: 'MySQL not supported' });
    }

    // Get team info
    const { data: teamData } = await supabaseAdmin
      .from('teams')
      .select('id, team_name, level, status, progress, start_time, end_time, hints_used')
      .eq('id', teamId).single();

    if (!teamData) {
      return res.status(404).json({ success: false, message: 'Team not found' });
    }

    // Get all questions for current level
    const { data: allQuestions } = await supabaseAdmin
      .from('puzzles')
      .select('id, puzzle_number, title, level, points')
      .eq('level', teamData.level).eq('is_active', true)
      .order('puzzle_number');

    // Get all submissions for this team
    const { data: submissions } = await supabaseAdmin
      .from('submissions')
      .select('puzzle_id, submitted_answer, is_correct, submitted_at, time_taken_seconds')
      .eq('team_id', teamId)
      .order('submitted_at', { ascending: false });

    // Get puzzle info for submissions
    const subPuzzleIds = [...new Set((submissions || []).map(s => s.puzzle_id))];
    let puzzleInfoMap = {};
    if (subPuzzleIds.length > 0) {
      const { data: puzzleInfo } = await supabaseAdmin
        .from('puzzles').select('id, puzzle_number, title, level, points').in('id', subPuzzleIds);
      (puzzleInfo || []).forEach(p => { puzzleInfoMap[p.id] = p; });
    }

    // Get team_question_progress for attempt counts
    let progressMap = {};
    try {
      const { data: progress } = await supabaseAdmin
        .from('team_question_progress')
        .select('puzzle_id, status, attempts, started_at, ended_at')
        .eq('team_id', teamId);
      (progress || []).forEach(p => { progressMap[p.puzzle_id] = p; });
    } catch (e) { /* table might not exist */ }

    // Build question summary
    const questionSummary = (allQuestions || []).map(q => {
      const questionSubmissions = (submissions || []).filter(s => s.puzzle_id === q.id);
      const correctSubmission = questionSubmissions.find(s => s.is_correct);
      const latestSubmission = questionSubmissions[0];
      const questionProgress = progressMap[q.id];

      return {
        questionNumber: q.puzzle_number, title: q.title, level: q.level, points: q.points,
        attempted: questionSubmissions.length > 0,
        status: correctSubmission ? 'correct' : (latestSubmission ? 'wrong' : 'not_attempted'),
        attempts: questionProgress?.attempts || questionSubmissions.length,
        submittedAnswer: latestSubmission?.submitted_answer || null,
        isCorrect: !!correctSubmission,
        timeTaken: latestSubmission?.time_taken_seconds || null,
        submittedAt: latestSubmission?.submitted_at || null
      };
    });

    const totalQuestions = (allQuestions || []).length;
    const attemptedQuestions = questionSummary.filter(q => q.attempted).length;
    const correctAnswers = questionSummary.filter(q => q.isCorrect).length;
    const wrongAnswers = attemptedQuestions - correctAnswers;
    const notAttempted = totalQuestions - attemptedQuestions;

    const startTime = teamData.start_time ? new Date(teamData.start_time) : null;
    const endTime = teamData.end_time ? new Date(teamData.end_time) : new Date();
    const totalTimeSeconds = startTime ? Math.floor((endTime - startTime) / 1000) : 0;

    res.json({
      success: true,
      summary: {
        team: {
          id: teamData.id, name: teamData.team_name, level: teamData.level,
          status: teamData.status, progress: teamData.progress, hintsUsed: teamData.hints_used
        },
        stats: {
          totalQuestions, attemptedQuestions, correctAnswers, wrongAnswers, notAttempted,
          totalTimeSeconds, qualificationThreshold: 8, qualified: correctAnswers >= 8
        },
        questions: questionSummary
      }
    });
  } catch (error) {
    console.error('Error fetching game summary:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch game summary' });
  }
};
