const db = require('../config/db');
const { v4: uuidv4 } = require('uuid');

// Get current game state
exports.getGameState = async (req, res) => {
  try {
    const [gameState] = await db.query('SELECT * FROM game_state LIMIT 1');
    
    if (gameState.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Game state not initialized'
      });
    }
    
    // Get additional stats
    const [teamStats] = await db.query(`
      SELECT 
        COUNT(*) as total_teams,
        SUM(CASE WHEN status = 'active' THEN 1 ELSE 0 END) as active_teams,
        SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as completed_teams
      FROM teams
    `);
    
    res.json({
      success: true,
      gameState: {
        ...gameState[0],
        ...teamStats[0]
      }
    });
  } catch (error) {
    console.error('Error fetching game state:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch game state'
    });
  }
};

// Start the game (Level 1)
exports.startGame = async (req, res) => {
  try {
    const [gameState] = await db.query('SELECT * FROM game_state LIMIT 1');
    
    if (gameState.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Game state not initialized'
      });
    }
    
    if (gameState[0].current_phase !== 'not_started') {
      return res.status(400).json({
        success: false,
        message: 'Game already started'
      });
    }
    
    // Start game
    await db.query(`
      UPDATE game_state 
      SET current_phase = 'level_1',
          level_1_unlocked = true,
          game_started_at = NOW(),
          is_paused = false
      WHERE id = ?
    `, [gameState[0].id]);
    
    // Update all qualified teams to active status
    await db.query(`
      UPDATE teams 
      SET status = 'active',
          start_time = NOW()
      WHERE status = 'qualified'
    `);
    
    res.json({
      success: true,
      message: 'Game started successfully! Level 1 unlocked.'
    });
  } catch (error) {
    console.error('Error starting game:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to start game'
    });
  }
};

// Unlock Level 2
exports.unlockLevel2 = async (req, res) => {
  try {
    const [gameState] = await db.query('SELECT * FROM game_state LIMIT 1');
    
    if (gameState.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Game state not initialized'
      });
    }
    
    if (!gameState[0].level_1_unlocked) {
      return res.status(400).json({
        success: false,
        message: 'Level 1 must be started first'
      });
    }
    
    await db.query(`
      UPDATE game_state 
      SET current_phase = 'level_2',
          level_2_unlocked = true
      WHERE id = ?
    `, [gameState[0].id]);
    
    res.json({
      success: true,
      message: 'Level 2 unlocked successfully!'
    });
  } catch (error) {
    console.error('Error unlocking Level 2:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to unlock Level 2'
    });
  }
};

// Pause game
exports.pauseGame = async (req, res) => {
  try {
    await db.query('UPDATE game_state SET is_paused = true WHERE id IS NOT NULL');
    
    res.json({
      success: true,
      message: 'Game paused'
    });
  } catch (error) {
    console.error('Error pausing game:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to pause game'
    });
  }
};

// Resume game
exports.resumeGame = async (req, res) => {
  try {
    await db.query('UPDATE game_state SET is_paused = false WHERE id IS NOT NULL');
    
    res.json({
      success: true,
      message: 'Game resumed'
    });
  } catch (error) {
    console.error('Error resuming game:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to resume game'
    });
  }
};

// End game
exports.endGame = async (req, res) => {
  try {
    await db.query(`
      UPDATE game_state 
      SET current_phase = 'completed',
          game_ended_at = NOW()
      WHERE id IS NOT NULL
    `);
    
    // Mark all active teams as completed
    await db.query(`
      UPDATE teams 
      SET status = 'completed',
          end_time = NOW()
      WHERE status = 'active'
    `);
    
    res.json({
      success: true,
      message: 'Game ended successfully'
    });
  } catch (error) {
    console.error('Error ending game:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to end game'
    });
  }
};

// Restart game - reset to initial state
exports.restartGame = async (req, res) => {
  try {
    // Reset game state
    await db.query(`
      UPDATE game_state 
      SET current_phase = 'not_started',
          level_1_unlocked = false,
          level_2_unlocked = false,
          game_started_at = NULL,
          game_ended_at = NULL,
          is_paused = false
      WHERE id IS NOT NULL
    `);
    
    // Reset all teams to waiting status
    await db.query(`
      UPDATE teams 
      SET status = 'waiting',
          level = 1,
          progress = 0,
          hints_used = 0,
          start_time = NULL,
          end_time = NULL
      WHERE status IN ('active', 'completed', 'paused')
    `);
    
    // Clear team progress
    await db.query('DELETE FROM team_progress');
    
    // Clear submissions
    await db.query('DELETE FROM submissions');
    
    // Clear activity logs
    await db.query('DELETE FROM activity_logs');
    
    res.json({
      success: true,
      message: 'Game restarted successfully'
    });
  } catch (error) {
    console.error('Error restarting game:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to restart game'
    });
  }
};

// Broadcast message to all teams
exports.broadcastMessage = async (req, res) => {
  try {
    const { message, message_type, expires_in_minutes } = req.body;
    
    if (!message) {
      return res.status(400).json({
        success: false,
        message: 'Message is required'
      });
    }
    
    const messageId = uuidv4();
    const expiresAt = expires_in_minutes 
      ? new Date(Date.now() + expires_in_minutes * 60000)
      : null;
    
    await db.query(
      `INSERT INTO broadcast_messages (id, message, message_type, sent_by, expires_at)
       VALUES (?, ?, ?, ?, ?)`,
      [messageId, message, message_type || 'info', req.user.id, expiresAt]
    );
    
    res.json({
      success: true,
      message: 'Message broadcasted successfully'
    });
  } catch (error) {
    console.error('Error broadcasting message:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to broadcast message'
    });
  }
};

// Get active broadcast messages
exports.getBroadcastMessages = async (req, res) => {
  try {
    const [messages] = await db.query(`
      SELECT * FROM broadcast_messages
      WHERE is_active = true
        AND (expires_at IS NULL OR expires_at > NOW())
      ORDER BY created_at DESC
    `);
    
    res.json({
      success: true,
      messages
    });
  } catch (error) {
    console.error('Error fetching messages:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch messages'
    });
  }
};

// Pause specific team
exports.pauseTeam = async (req, res) => {
  try {
    const { teamId } = req.params;
    
    await db.query(`
      UPDATE teams 
      SET status = 'paused'
      WHERE id = ?
    `, [teamId]);
    
    res.json({
      success: true,
      message: 'Team paused'
    });
  } catch (error) {
    console.error('Error pausing team:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to pause team'
    });
  }
};

// Resume specific team
exports.resumeTeam = async (req, res) => {
  try {
    const { teamId } = req.params;
    
    await db.query(`
      UPDATE teams 
      SET status = 'active'
      WHERE id = ? AND status = 'paused'
    `, [teamId]);
    
    res.json({
      success: true,
      message: 'Team resumed'
    });
  } catch (error) {
    console.error('Error resuming team:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to resume team'
    });
  }
};

// Force skip puzzle for team
exports.skipPuzzle = async (req, res) => {
  try {
    const { teamId, puzzleId } = req.params;
    
    // Mark current puzzle as completed
    await db.query(`
      UPDATE team_progress 
      SET is_completed = true,
          completed_at = NOW()
      WHERE team_id = ? AND puzzle_id = ?
    `, [teamId, puzzleId]);
    
    res.json({
      success: true,
      message: 'Puzzle skipped for team'
    });
  } catch (error) {
    console.error('Error skipping puzzle:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to skip puzzle'
    });
  }
};

// Reset team progress
exports.resetTeamProgress = async (req, res) => {
  try {
    const { teamId } = req.params;
    
    // Delete team progress
    await db.query('DELETE FROM team_progress WHERE team_id = ?', [teamId]);
    await db.query('DELETE FROM submissions WHERE team_id = ?', [teamId]);
    await db.query('DELETE FROM hint_usage WHERE team_id = ?', [teamId]);
    await db.query('DELETE FROM inventory WHERE team_id = ?', [teamId]);
    
    // Reset team
    await db.query(`
      UPDATE teams 
      SET current_level = 1,
          current_puzzle = 1,
          progress = 0,
          hints_used = 0,
          start_time = NULL,
          end_time = NULL
      WHERE id = ?
    `, [teamId]);
    
    res.json({
      success: true,
      message: 'Team progress reset'
    });
  } catch (error) {
    console.error('Error resetting team:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to reset team'
    });
  }
};
