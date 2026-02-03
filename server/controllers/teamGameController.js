const db = require('../config/db');
const { v4: uuidv4 } = require('uuid');

// Get current puzzle for team
exports.getCurrentPuzzle = async (req, res) => {
  try {
    const teamId = req.user.team_id;
    
    if (!teamId) {
      return res.status(400).json({
        success: false,
        message: 'Team ID not found in token'
      });
    }
    
    // Get team's current level and status
    const [team] = await db.query(
      'SELECT level, status, progress FROM teams WHERE id = ?',
      [teamId]
    );
    
    if (team.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Team not found'
      });
    }
    
    if (team[0].status !== 'active') {
      return res.json({
        success: true,
        message: 'Game not started or team not active',
        puzzle: null,
        team_status: team[0].status
      });
    }
    
    // Get the last completed puzzle to determine current puzzle
    const [lastCompleted] = await db.query(
      `SELECT tp.current_puzzle, p.puzzle_number 
       FROM team_progress tp
       JOIN puzzles p ON tp.puzzle_id = p.id
       WHERE tp.team_id = ? AND tp.is_completed = true
       ORDER BY p.level DESC, p.puzzle_number DESC
       LIMIT 1`,
      [teamId]
    );
    
    const currentLevel = team[0].level || 1;
    const currentPuzzleNumber = lastCompleted.length > 0 ? lastCompleted[0].puzzle_number + 1 : 1;
    
    // Get the current puzzle
    const [puzzles] = await db.query(
      `SELECT id, level, puzzle_number, title, description, puzzle_type, 
              puzzle_content, puzzle_file_url, points, time_limit_minutes
       FROM puzzles 
       WHERE level = ? AND puzzle_number >= ? AND is_active = true
       ORDER BY puzzle_number ASC
       LIMIT 1`,
      [currentLevel, currentPuzzleNumber]
    );
    
    if (puzzles.length === 0) {
      // No more puzzles at current level - check for next level
      const [nextLevelPuzzle] = await db.query(
        `SELECT id, level, puzzle_number, title, description, puzzle_type, 
                puzzle_content, puzzle_file_url, points, time_limit_minutes
         FROM puzzles 
         WHERE level > ? AND is_active = true
         ORDER BY level ASC, puzzle_number ASC
         LIMIT 1`,
        [currentLevel]
      );
      
      if (nextLevelPuzzle.length === 0) {
        return res.json({
          success: true,
          message: 'All puzzles completed!',
          puzzle: null,
          game_completed: true
        });
      }
      
      // Check if next level is unlocked
      const [gameState] = await db.query('SELECT level_2_unlocked FROM game_state LIMIT 1');
      if (nextLevelPuzzle[0].level === 2 && !gameState[0]?.level_2_unlocked) {
        return res.json({
          success: true,
          message: 'Level 1 completed! Waiting for Level 2 to unlock.',
          puzzle: null,
          waiting_for_level: 2
        });
      }
    }
    
    const puzzle = puzzles[0];
    
    if (!puzzle) {
      return res.json({
        success: true,
        message: 'No puzzle available',
        puzzle: null
      });
    }
    
    // Get team's progress on this puzzle
    const [progress] = await db.query(
      `SELECT started_at, attempts, hints_used 
       FROM team_progress 
       WHERE team_id = ? AND puzzle_id = ?`,
      [teamId, puzzle.id]
    );
    
    // If no progress exists, create it
    if (progress.length === 0) {
      const progressId = uuidv4();
      await db.query(
        `INSERT INTO team_progress (id, team_id, puzzle_id, current_level, current_puzzle)
         VALUES (?, ?, ?, ?, ?)`,
        [progressId, teamId, puzzle.id, puzzle.level, puzzle.puzzle_number]
      );
    }
    
    // Get available hints (not used yet)
    const [allHints] = await db.query(
      'SELECT id, hint_number, time_penalty_seconds FROM hints WHERE puzzle_id = ? AND is_active = true ORDER BY hint_number',
      [puzzle.id]
    );
    
    const [usedHints] = await db.query(
      'SELECT hint_id FROM hint_usage WHERE team_id = ? AND puzzle_id = ?',
      [teamId, puzzle.id]
    );
    
    const usedHintIds = usedHints.map(h => h.hint_id);
    const availableHints = allHints.filter(h => !usedHintIds.includes(h.id));
    
    res.json({
      success: true,
      puzzle: {
        ...puzzle,
        progress: progress[0] || { attempts: 0, hints_used: 0 },
        available_hints: availableHints.length,
        total_hints: allHints.length
      }
    });
  } catch (error) {
    console.error('Error fetching current puzzle:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch puzzle',
      error: error.message
    });
  }
};

// Submit puzzle answer
exports.submitAnswer = async (req, res) => {
  try {
    const teamId = req.user.team_id;
    const { puzzle_id, answer } = req.body;
    
    if (!puzzle_id || !answer) {
      return res.status(400).json({
        success: false,
        message: 'puzzle_id and answer are required'
      });
    }
    
    // Check if team is active
    const [team] = await db.query(
      'SELECT status, level FROM teams WHERE id = ?',
      [teamId]
    );
    
    if (team.length === 0 || team[0].status !== 'active') {
      return res.status(403).json({
        success: false,
        message: 'Team is not active'
      });
    }
    
    // Check if game is paused
    const [gameState] = await db.query('SELECT is_paused FROM game_state LIMIT 1');
    if (gameState[0]?.is_paused) {
      return res.status(403).json({
        success: false,
        message: 'Game is currently paused'
      });
    }
    
    // Get puzzle details
    const [puzzle] = await db.query(
      'SELECT correct_answer, level, puzzle_number, points FROM puzzles WHERE id = ?',
      [puzzle_id]
    );
    
    if (puzzle.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Puzzle not found'
      });
    }
    
    // Get progress
    const [progress] = await db.query(
      'SELECT started_at, attempts FROM team_progress WHERE team_id = ? AND puzzle_id = ?',
      [teamId, puzzle_id]
    );
    
    const timeTaken = progress[0] 
      ? Math.floor((Date.now() - new Date(progress[0].started_at).getTime()) / 1000)
      : 0;
    
    // Check answer (case-insensitive, trim whitespace)
    const isCorrect = answer.trim().toLowerCase() === puzzle[0].correct_answer.trim().toLowerCase();
    
    // Record submission
    const submissionId = uuidv4();
    await db.query(
      `INSERT INTO submissions (id, team_id, puzzle_id, submitted_answer, is_correct, time_taken_seconds)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [submissionId, teamId, puzzle_id, answer, isCorrect, timeTaken]
    );
    
    // Update attempts
    await db.query(
      'UPDATE team_progress SET attempts = attempts + 1 WHERE team_id = ? AND puzzle_id = ?',
      [teamId, puzzle_id]
    );
    
    // Log activity
    await db.query(
      `INSERT INTO activity_logs (id, team_id, user_id, action_type, description, puzzle_id)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [
        uuidv4(),
        teamId,
        req.user.id,
        isCorrect ? 'puzzle_solve' : 'puzzle_fail',
        isCorrect ? 'Puzzle solved correctly' : 'Incorrect answer submitted',
        puzzle_id
      ]
    );
    
    if (isCorrect) {
      // Mark puzzle as completed
      await db.query(
        `UPDATE team_progress 
         SET is_completed = true, completed_at = NOW()
         WHERE team_id = ? AND puzzle_id = ?`,
        [teamId, puzzle_id]
      );
      
      // Get next puzzle
      const [nextPuzzle] = await db.query(
        `SELECT id, puzzle_number FROM puzzles 
         WHERE level = ? AND puzzle_number > ? AND is_active = true
         ORDER BY puzzle_number LIMIT 1`,
        [puzzle[0].level, puzzle[0].puzzle_number]
      );
      
      if (nextPuzzle.length > 0) {
        // Move to next puzzle - update progress
        await db.query(
          'UPDATE teams SET progress = progress + 10 WHERE id = ?',
          [teamId]
        );
      } else {
        // Check if there's next level
        const [nextLevel] = await db.query(
          'SELECT MIN(level) as next_level FROM puzzles WHERE level > ? AND is_active = true',
          [puzzle[0].level]
        );
        
        if (nextLevel[0]?.next_level) {
          // Check if level is unlocked
          const [gameState] = await db.query('SELECT level_2_unlocked FROM game_state LIMIT 1');
          
          if (nextLevel[0].next_level === 2 && !gameState[0]?.level_2_unlocked) {
            // Level completed, waiting for level 2
            await db.query(
              'UPDATE teams SET progress = 50 WHERE id = ?',
              [teamId]
            );
            
            return res.json({
              success: true,
              is_correct: true,
              message: 'Level 1 completed! Waiting for Level 2 to unlock.',
              level_completed: true,
              next_puzzle: null
            });
          } else {
            // Move to next level
            await db.query(
              'UPDATE teams SET level = ?, progress = 50 WHERE id = ?',
              [nextLevel[0].next_level, teamId]
            );
          }
        } else {
          // All puzzles completed!
          await db.query(
            'UPDATE teams SET status = \'completed\', end_time = NOW(), progress = 100 WHERE id = ?',
            [teamId]
          );
          
          return res.json({
            success: true,
            is_correct: true,
            message: 'Congratulations! All puzzles completed!',
            game_completed: true
          });
        }
      }
      
      return res.json({
        success: true,
        is_correct: true,
        message: 'Correct answer! Moving to next puzzle.',
        points: puzzle[0].points,
        time_taken: timeTaken
      });
    } else {
      return res.json({
        success: true,
        is_correct: false,
        message: 'Incorrect answer. Try again!',
        attempts: (progress[0]?.attempts || 0) + 1
      });
    }
  } catch (error) {
    console.error('Error submitting answer:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to submit answer'
    });
  }
};

// Request hint
exports.requestHint = async (req, res) => {
  try {
    const teamId = req.user.team_id;
    const { puzzle_id } = req.body;
    
    if (!puzzle_id) {
      return res.status(400).json({
        success: false,
        message: 'puzzle_id is required'
      });
    }
    
    // Get available hints not yet used
    const [allHints] = await db.query(
      'SELECT * FROM hints WHERE puzzle_id = ? AND is_active = true ORDER BY hint_number',
      [puzzle_id]
    );
    
    const [usedHints] = await db.query(
      'SELECT hint_id FROM hint_usage WHERE team_id = ? AND puzzle_id = ?',
      [teamId, puzzle_id]
    );
    
    const usedHintIds = usedHints.map(h => h.hint_id);
    const availableHints = allHints.filter(h => !usedHintIds.includes(h.id));
    
    if (availableHints.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'No more hints available for this puzzle'
      });
    }
    
    // Get the next hint
    const nextHint = availableHints[0];
    
    // Record hint usage
    const usageId = uuidv4();
    await db.query(
      `INSERT INTO hint_usage (id, team_id, hint_id, puzzle_id, time_penalty_applied)
       VALUES (?, ?, ?, ?, ?)`,
      [usageId, teamId, nextHint.id, puzzle_id, nextHint.time_penalty_seconds]
    );
    
    // Update team hints count
    await db.query(
      'UPDATE teams SET hints_used = hints_used + 1 WHERE id = ?',
      [teamId]
    );
    
    // Update progress hints count
    await db.query(
      'UPDATE team_progress SET hints_used = hints_used + 1 WHERE team_id = ? AND puzzle_id = ?',
      [teamId, puzzle_id]
    );
    
    // Log activity
    await db.query(
      `INSERT INTO activity_logs (id, team_id, user_id, action_type, description, puzzle_id)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [
        uuidv4(),
        teamId,
        req.user.id,
        'hint_use',
        `Used hint ${nextHint.hint_number}`,
        puzzle_id
      ]
    );
    
    res.json({
      success: true,
      hint: {
        hint_number: nextHint.hint_number,
        hint_text: nextHint.hint_text,
        time_penalty_seconds: nextHint.time_penalty_seconds
      },
      remaining_hints: availableHints.length - 1
    });
  } catch (error) {
    console.error('Error requesting hint:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get hint'
    });
  }
};

// Get team progress
exports.getTeamProgress = async (req, res) => {
  try {
    const teamId = req.user.team_id;
    
    if (!teamId) {
      return res.status(400).json({
        success: false,
        message: 'Team ID not found in token'
      });
    }
    
    const [team] = await db.query(
      `SELECT t.team_name, t.level, t.progress, t.hints_used, 
              t.status, t.start_time, t.end_time
       FROM teams t WHERE t.id = ?`,
      [teamId]
    );
    
    if (team.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Team not found'
      });
    }
    
    // Get completed puzzles count
    const [completed] = await db.query(
      'SELECT COUNT(*) as completed_count FROM team_progress WHERE team_id = ? AND is_completed = true',
      [teamId]
    );
    
    // Get total puzzles
    const [total] = await db.query(
      'SELECT COUNT(*) as total_count FROM puzzles WHERE is_active = true'
    );
    
    // Calculate time elapsed
    let timeElapsed = null;
    if (team[0].start_time) {
      const endTime = team[0].end_time ? new Date(team[0].end_time) : new Date();
      timeElapsed = Math.floor((endTime - new Date(team[0].start_time)) / 1000);
    }
    
    res.json({
      success: true,
      progress: {
        team_name: team[0].team_name,
        current_level: team[0].level,
        progress: team[0].progress,
        hints_used: team[0].hints_used,
        status: team[0].status,
        start_time: team[0].start_time,
        end_time: team[0].end_time,
        completed_puzzles: completed[0].completed_count,
        total_puzzles: total[0].total_count,
        time_elapsed_seconds: timeElapsed
      }
    });
  } catch (error) {
    console.error('Error fetching progress:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch progress',
      error: error.message
    });
  }
};

// Get team inventory
exports.getInventory = async (req, res) => {
  try {
    const teamId = req.user.team_id;
    
    const [items] = await db.query(
      `SELECT id, item_type, item_name, item_value, collected_at, is_used
       FROM inventory
       WHERE team_id = ?
       ORDER BY collected_at DESC`,
      [teamId]
    );
    
    res.json({
      success: true,
      inventory: items
    });
  } catch (error) {
    console.error('Error fetching inventory:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch inventory'
    });
  }
};

// Add item to inventory
exports.addInventoryItem = async (req, res) => {
  try {
    const teamId = req.user.team_id;
    const { item_type, item_name, item_value, puzzle_id } = req.body;
    
    if (!item_name) {
      return res.status(400).json({
        success: false,
        message: 'item_name is required'
      });
    }
    
    const itemId = uuidv4();
    await db.query(
      `INSERT INTO inventory (id, team_id, item_type, item_name, item_value, collected_from_puzzle)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [itemId, teamId, item_type || 'clue', item_name, item_value, puzzle_id || null]
    );
    
    res.json({
      success: true,
      message: 'Item added to inventory'
    });
  } catch (error) {
    console.error('Error adding inventory item:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to add item'
    });
  }
};

// Get activity logs for team
exports.getActivityLogs = async (req, res) => {
  try {
    const teamId = req.user.team_id;
    
    const [logs] = await db.query(
      `SELECT action_type, description, created_at
       FROM activity_logs
       WHERE team_id = ?
       ORDER BY created_at DESC
       LIMIT 50`,
      [teamId]
    );
    
    res.json({
      success: true,
      logs
    });
  } catch (error) {
    console.error('Error fetching logs:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch logs'
    });
  }
};
