const db = require('../config/db');
const { supabaseAdmin } = require('../config/supabase');
const { v4: uuidv4 } = require('uuid');
const { cache, cacheKeys, TTL, cached } = require('../utils/cache');

const USE_SUPABASE = process.env.USE_SUPABASE === 'true';

// Get current game state (cached for 2 seconds to reduce DB load)
exports.getGameState = async (req, res) => {
  try {
    const gameData = await cached(cacheKeys.gameState(), async () => {
      if (USE_SUPABASE) {
        let { data: gameState, error } = await supabaseAdmin
          .from('game_state')
          .select('*')
          .limit(1);

        if (error) throw error;

        // If game state doesn't exist, create a default one
        if (!gameState || gameState.length === 0) {
          const newId = uuidv4();
          const { data: inserted, error: insertErr } = await supabaseAdmin
            .from('game_state')
            .insert({
              id: newId,
              game_active: false,
              current_level: 1,
              level1_open: false,
              level2_open: false
            })
            .select('*');

          if (insertErr) throw insertErr;
          gameState = inserted;
        }

        // Get team stats by fetching all teams and counting in JS
        let totalTeams = 0, activeTeams = 0, completedTeams = 0;
        try {
          const { data: teams } = await supabaseAdmin.from('teams').select('status');
          if (teams) {
            totalTeams = teams.length;
            activeTeams = teams.filter(t => t.status === 'active').length;
            completedTeams = teams.filter(t => t.status === 'completed').length;
          }
        } catch (e) {
          console.log('Could not fetch team stats:', e.message);
        }

        return {
          ...gameState[0],
          total_teams: totalTeams,
          active_teams: activeTeams,
          completed_teams: completedTeams
        };
      }

      let [gameState] = await db.query('SELECT * FROM game_state LIMIT 1');
      
      // If game state doesn't exist, create a default one
      if (gameState.length === 0) {
        const newId = uuidv4();
        await db.query(`
          INSERT INTO game_state (id, game_name, current_phase, level_1_unlocked, level_2_unlocked)
          VALUES (?, 'Lockdown HQ Event', 'not_started', false, false)
        `, [newId]);
        
        [gameState] = await db.query('SELECT * FROM game_state WHERE id = ?', [newId]);
      }
      
      // Get additional stats
      const [teamStats] = await db.query(`
        SELECT 
          COUNT(*) as total_teams,
          SUM(CASE WHEN status = 'active' THEN 1 ELSE 0 END) as active_teams,
          SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as completed_teams
        FROM teams
      `);
      
      return {
        ...gameState[0],
        ...teamStats[0]
      };
    }, TTL.GAME_STATE);

    res.json({
      success: true,
      gameState: gameData
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
    if (USE_SUPABASE) {
      const { data: gameState, error } = await supabaseAdmin
        .from('game_state')
        .select('*')
        .limit(1);

      if (error) throw error;

      if (!gameState || gameState.length === 0) {
        return res.status(404).json({
          success: false,
          message: 'Game state not initialized'
        });
      }

      if (gameState[0].game_active) {
        return res.status(400).json({
          success: false,
          message: 'Game already started'
        });
      }

      const now = new Date().toISOString();

      // Start game
      const { error: updateErr } = await supabaseAdmin
        .from('game_state')
        .update({
          game_active: true,
          current_level: 1,
          level1_open: true,
          game_started_at: now
        })
        .eq('id', gameState[0].id);

      if (updateErr) throw updateErr;

      // Update all waiting and qualified teams to active status
      await supabaseAdmin
        .from('teams')
        .update({
          status: 'active',
          start_time: now
        })
        .in('status', ['waiting', 'qualified']);

      return res.json({
        success: true,
        message: 'Game started successfully! Level 1 unlocked.'
      });
    }

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
    
    // Update all waiting and qualified teams to active status
    await db.query(`
      UPDATE teams 
      SET status = 'active',
          start_time = NOW()
      WHERE status IN ('waiting', 'qualified')
    `);
    
    // Invalidate cached data
    cache.delete(cacheKeys.gameState());
    cache.deleteByPrefix('leaderboard');
    
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
    if (USE_SUPABASE) {
      const { data: gameState, error } = await supabaseAdmin
        .from('game_state')
        .select('*')
        .limit(1);

      if (error) throw error;

      // If game state doesn't exist, create it
      if (!gameState || gameState.length === 0) {
        const newId = uuidv4();
        await supabaseAdmin.from('game_state').insert({
          id: newId,
          game_active: true,
          current_level: 2,
          level1_open: true,
          level2_open: true
        });

        return res.json({
          success: true,
          message: 'Level 2 unlocked successfully! (Game state initialized)'
        });
      }

      // If level 1 not started, start it along with level 2
      if (!gameState[0].level1_open) {
        const now = new Date().toISOString();
        await supabaseAdmin
          .from('game_state')
          .update({
            current_level: 2,
            level1_open: true,
            level2_open: true,
            game_active: true,
            game_started_at: gameState[0].game_started_at || now
          })
          .eq('id', gameState[0].id);
      } else {
        await supabaseAdmin
          .from('game_state')
          .update({
            current_level: 2,
            level2_open: true
          })
          .eq('id', gameState[0].id);
      }

      return res.json({
        success: true,
        message: 'Level 2 unlocked successfully!'
      });
    }

    let [gameState] = await db.query('SELECT * FROM game_state LIMIT 1');
    
    // If game state doesn't exist, create it
    if (gameState.length === 0) {
      const newId = uuidv4();
      await db.query(`
        INSERT INTO game_state (id, game_name, current_phase, level_1_unlocked, level_2_unlocked)
        VALUES (?, 'Lockdown HQ Event', 'level_2', true, true)
      `, [newId]);
      
      return res.json({
        success: true,
        message: 'Level 2 unlocked successfully! (Game state initialized)'
      });
    }
    
    // If level 1 not started, start it along with level 2
    if (!gameState[0].level_1_unlocked) {
      await db.query(`
        UPDATE game_state 
        SET current_phase = 'level_2',
            level_1_unlocked = true,
            level_2_unlocked = true,
            game_started_at = COALESCE(game_started_at, NOW())
        WHERE id = ?
      `, [gameState[0].id]);
    } else {
      await db.query(`
        UPDATE game_state 
        SET current_phase = 'level_2',
            level_2_unlocked = true
        WHERE id = ?
      `, [gameState[0].id]);
    }
    
    // Invalidate cached game state
    cache.delete(cacheKeys.gameState());
    
    res.json({
      success: true,
      message: 'Level 2 unlocked successfully!'
    });
  } catch (error) {
    console.error('Error unlocking Level 2:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to unlock Level 2: ' + error.message
    });
  }
};

// Pause game
exports.pauseGame = async (req, res) => {
  try {
    if (USE_SUPABASE) {
      const { error } = await supabaseAdmin
        .from('game_state')
        .update({ is_paused: true })
        .not('id', 'is', null);

      if (error) throw error;

      return res.json({
        success: true,
        message: 'Game paused'
      });
    }

    await db.query('UPDATE game_state SET is_paused = true WHERE id IS NOT NULL');
    
    // Invalidate cached game state
    cache.delete(cacheKeys.gameState());
    
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
    if (USE_SUPABASE) {
      const { error } = await supabaseAdmin
        .from('game_state')
        .update({ is_paused: false })
        .not('id', 'is', null);

      if (error) throw error;

      return res.json({
        success: true,
        message: 'Game resumed'
      });
    }

    await db.query('UPDATE game_state SET is_paused = false WHERE id IS NOT NULL');
    
    // Invalidate cached game state
    cache.delete(cacheKeys.gameState());
    
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
    if (USE_SUPABASE) {
      const now = new Date().toISOString();

      const { error } = await supabaseAdmin
        .from('game_state')
        .update({
          game_active: false,
          game_ended_at: now
        })
        .not('id', 'is', null);

      if (error) throw error;

      // Mark all active teams as completed
      await supabaseAdmin
        .from('teams')
        .update({
          status: 'completed',
          end_time: now
        })
        .eq('status', 'active');

      return res.json({
        success: true,
        message: 'Game ended successfully'
      });
    }

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
    if (USE_SUPABASE) {
      // Reset game state
      const { error } = await supabaseAdmin
        .from('game_state')
        .update({
          game_active: false,
          current_level: 1,
          level1_open: true,
          level2_open: false,
          game_started_at: null,
          game_ended_at: null
        })
        .not('id', 'is', null);

      if (error) throw error;

      // Reset all teams to waiting status
      await supabaseAdmin
        .from('teams')
        .update({
          status: 'waiting',
          level: 1,
          progress: 0,
          hints_used: 0,
          start_time: null,
          end_time: null
        })
        .in('status', ['active', 'completed', 'paused', 'disqualified', 'waiting']);

      // Clear team progress
      try {
        await supabaseAdmin.from('team_progress').delete().not('id', 'is', null);
      } catch (e) {
        console.log('team_progress table may not exist:', e.message);
      }

      // Clear team_question_progress
      try {
        await supabaseAdmin.from('team_question_progress').delete().not('id', 'is', null);
      } catch (e) {
        console.log('team_question_progress table may not exist:', e.message);
      }

      // Clear team_sessions
      try {
        await supabaseAdmin.from('team_sessions').delete().not('id', 'is', null);
      } catch (e) {
        console.log('team_sessions table may not exist:', e.message);
      }

      // Clear submissions
      try {
        await supabaseAdmin.from('submissions').delete().not('id', 'is', null);
      } catch (e) {
        console.log('submissions table may not exist:', e.message);
      }

      // Clear activity logs
      try {
        await supabaseAdmin.from('activity_logs').delete().not('id', 'is', null);
      } catch (e) {
        console.log('activity_logs table may not exist:', e.message);
      }

      return res.json({
        success: true,
        message: 'Game restarted successfully. All progress, submissions, and attempt data cleared.'
      });
    }

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
      WHERE status IN ('active', 'completed', 'paused', 'disqualified', 'waiting')
    `);
    
    // Clear team progress
    await db.query('DELETE FROM team_progress');
    
    // Clear team_question_progress (question attempt data)
    try {
      await db.query('DELETE FROM team_question_progress');
    } catch (err) {
      console.log('team_question_progress table may not exist');
    }
    
    // Clear team_sessions
    try {
      await db.query('DELETE FROM team_sessions');
    } catch (err) {
      console.log('team_sessions table may not exist');
    }
    
    // Clear submissions
    await db.query('DELETE FROM submissions');
    
    // Clear activity logs
    await db.query('DELETE FROM activity_logs');
    
    // Clear audit logs (optional - keep for security)
    // await db.query('DELETE FROM audit_logs');
    
    res.json({
      success: true,
      message: 'Game restarted successfully. All progress, submissions, and attempt data cleared.'
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
      return res.status(400).json({ success: false, message: 'Message is required' });
    }

    if (USE_SUPABASE) {
      const expiresAt = expires_in_minutes
        ? new Date(Date.now() + expires_in_minutes * 60000).toISOString()
        : null;
      try {
        await supabaseAdmin.from('broadcast_messages').insert({
          id: uuidv4(), message, message_type: message_type || 'info',
          sent_by: req.user.id, expires_at: expiresAt
        });
      } catch (e) {
        console.log('broadcast_messages table may not exist:', e.message);
      }
      return res.json({ success: true, message: 'Message broadcasted successfully' });
    }

    const messageId = uuidv4();
    const expiresAt = expires_in_minutes
      ? new Date(Date.now() + expires_in_minutes * 60000)
      : null;
    await db.query(
      `INSERT INTO broadcast_messages (id, message, message_type, sent_by, expires_at) VALUES (?, ?, ?, ?, ?)`,
      [messageId, message, message_type || 'info', req.user.id, expiresAt]
    );
    res.json({ success: true, message: 'Message broadcasted successfully' });
  } catch (error) {
    console.error('Error broadcasting message:', error);
    res.status(500).json({ success: false, message: 'Failed to broadcast message' });
  }
};

// Get active broadcast messages
exports.getBroadcastMessages = async (req, res) => {
  try {
    if (USE_SUPABASE) {
      try {
        const { data: messages } = await supabaseAdmin
          .from('broadcast_messages')
          .select('*')
          .eq('is_active', true)
          .or('expires_at.is.null,expires_at.gt.' + new Date().toISOString())
          .order('created_at', { ascending: false });
        return res.json({ success: true, messages: messages || [] });
      } catch (e) {
        // Table may not exist
        console.log('broadcast_messages table may not exist:', e.message);
        return res.json({ success: true, messages: [] });
      }
    }

    const [messages] = await db.query(`
      SELECT * FROM broadcast_messages
      WHERE is_active = true AND (expires_at IS NULL OR expires_at > NOW())
      ORDER BY created_at DESC
    `);
    res.json({ success: true, messages });
  } catch (error) {
    console.error('Error fetching messages:', error);
    res.json({ success: true, messages: [] });
  }
};

// Pause specific team
exports.pauseTeam = async (req, res) => {
  try {
    const { teamId } = req.params;

    if (USE_SUPABASE) {
      const { error } = await supabaseAdmin
        .from('teams')
        .update({ status: 'paused' })
        .eq('id', teamId);

      if (error) throw error;

      return res.json({
        success: true,
        message: 'Team paused'
      });
    }
    
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

    if (USE_SUPABASE) {
      const { error } = await supabaseAdmin
        .from('teams')
        .update({ status: 'active' })
        .eq('id', teamId)
        .eq('status', 'paused');

      if (error) throw error;

      return res.json({
        success: true,
        message: 'Team resumed'
      });
    }
    
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

    if (USE_SUPABASE) {
      const now = new Date().toISOString();
      const { error } = await supabaseAdmin
        .from('team_progress')
        .update({
          is_completed: true,
          completed_at: now
        })
        .eq('team_id', teamId)
        .eq('puzzle_id', puzzleId);

      if (error) throw error;

      return res.json({
        success: true,
        message: 'Puzzle skipped for team'
      });
    }
    
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

    if (USE_SUPABASE) {
      // Delete team progress
      try {
        await supabaseAdmin.from('team_progress').delete().eq('team_id', teamId);
      } catch (e) {
        console.log('team_progress delete error:', e.message);
      }

      try {
        await supabaseAdmin.from('submissions').delete().eq('team_id', teamId);
      } catch (e) {
        console.log('submissions delete error:', e.message);
      }

      // Clear team_question_progress
      try {
        await supabaseAdmin.from('team_question_progress').delete().eq('team_id', teamId);
      } catch (e) {
        console.log('team_question_progress may not exist:', e.message);
      }

      // Clear team_sessions
      try {
        await supabaseAdmin.from('team_sessions').delete().eq('team_id', teamId);
      } catch (e) {
        console.log('team_sessions may not exist:', e.message);
      }

      // Clear hint_usage
      try {
        await supabaseAdmin.from('hint_usage').delete().eq('team_id', teamId);
      } catch (e) {
        console.log('hint_usage may not exist:', e.message);
      }

      // Clear inventory
      try {
        await supabaseAdmin.from('inventory').delete().eq('team_id', teamId);
      } catch (e) {
        console.log('inventory may not exist:', e.message);
      }

      // Reset team
      const { error } = await supabaseAdmin
        .from('teams')
        .update({
          level: 1,
          status: 'waiting',
          progress: 0,
          hints_used: 0,
          start_time: null,
          end_time: null
        })
        .eq('id', teamId);

      if (error) throw error;

      return res.json({
        success: true,
        message: 'Team progress reset successfully. All attempt data cleared.'
      });
    }
    
    // Delete team progress
    await db.query('DELETE FROM team_progress WHERE team_id = ?', [teamId]);
    await db.query('DELETE FROM submissions WHERE team_id = ?', [teamId]);
    
    // Clear team_question_progress (question attempt data)
    try {
      await db.query('DELETE FROM team_question_progress WHERE team_id = ?', [teamId]);
    } catch (err) {
      console.log('team_question_progress may not exist');
    }
    
    // Clear team_sessions
    try {
      await db.query('DELETE FROM team_sessions WHERE team_id = ?', [teamId]);
    } catch (err) {
      console.log('team_sessions may not exist');
    }
    
    try {
      await db.query('DELETE FROM hint_usage WHERE team_id = ?', [teamId]);
    } catch (err) {
      console.log('hint_usage may not exist');
    }
    
    try {
      await db.query('DELETE FROM inventory WHERE team_id = ?', [teamId]);
    } catch (err) {
      console.log('inventory may not exist');
    }
    
    // Reset team
    await db.query(`
      UPDATE teams 
      SET level = 1,
          status = 'waiting',
          progress = 0,
          hints_used = 0,
          start_time = NULL,
          end_time = NULL
      WHERE id = ?
    `, [teamId]);
    
    res.json({
      success: true,
      message: 'Team progress reset successfully. All attempt data cleared.'
    });
  } catch (error) {
    console.error('Error resetting team:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to reset team'
    });
  }
};

/**
 * COMPLETE DATA CLEANUP - DELETE ALL TEAMS AND USERS
 * WARNING: This permanently deletes all team and user data!
 * Use this to reset the system for a new event.
 */
exports.deleteAllTeamsAndUsers = async (req, res) => {
  try {
    const { confirmationCode } = req.body;
    
    // Require confirmation code to prevent accidental deletion
    if (confirmationCode !== 'DELETE_ALL_DATA') {
      return res.status(400).json({
        success: false,
        message: 'Invalid confirmation code. Type DELETE_ALL_DATA to confirm.'
      });
    }

    if (USE_SUPABASE) {
      // Delete in correct order to respect foreign key constraints
      
      // Delete team question progress
      try {
        await supabaseAdmin.from('team_question_progress').delete().not('id', 'is', null);
      } catch (e) {
        console.log('team_question_progress cleanup:', e.message);
      }

      // Delete team level status
      try {
        await supabaseAdmin.from('team_level_status').delete().not('id', 'is', null);
      } catch (e) {
        console.log('team_level_status cleanup:', e.message);
      }

      // Delete evaluation audit logs
      try {
        await supabaseAdmin.from('evaluation_audit_log').delete().not('id', 'is', null);
      } catch (e) {
        console.log('evaluation_audit_log cleanup:', e.message);
      }

      // Delete hint usage
      try {
        await supabaseAdmin.from('hint_usage').delete().not('id', 'is', null);
      } catch (e) {
        console.log('hint_usage cleanup:', e.message);
      }

      // Delete team progress
      try {
        await supabaseAdmin.from('team_progress').delete().not('id', 'is', null);
      } catch (e) {
        console.log('team_progress cleanup:', e.message);
      }

      // Delete submissions
      try {
        await supabaseAdmin.from('submissions').delete().not('id', 'is', null);
      } catch (e) {
        console.log('submissions cleanup:', e.message);
      }

      // Delete activity logs
      try {
        await supabaseAdmin.from('activity_logs').delete().not('id', 'is', null);
      } catch (e) {
        console.log('activity_logs cleanup:', e.message);
      }

      // Delete refresh tokens
      try {
        await supabaseAdmin.from('refresh_tokens').delete().not('id', 'is', null);
      } catch (e) {
        console.log('refresh_tokens cleanup:', e.message);
      }

      // Delete email OTPs
      try {
        await supabaseAdmin.from('email_otps').delete().not('id', 'is', null);
      } catch (e) {
        console.log('email_otps cleanup:', e.message);
      }

      // Delete team members
      try {
        await supabaseAdmin.from('team_members').delete().not('id', 'is', null);
      } catch (e) {
        console.log('team_members cleanup:', e.message);
      }

      // Delete teams
      try {
        await supabaseAdmin.from('teams').delete().not('id', 'is', null);
      } catch (e) {
        console.log('teams cleanup:', e.message);
      }

      // Delete team users (keep admins)
      try {
        await supabaseAdmin.from('users').delete().eq('role', 'team');
      } catch (e) {
        console.log('users cleanup:', e.message);
      }

      // Optional: Reset evaluation state
      try {
        await supabaseAdmin.from('level_evaluation_state').delete().not('id', 'is', null);
      } catch (e) {
        console.log('level_evaluation_state cleanup:', e.message);
      }

      return res.json({
        success: true,
        message: 'All team and user data deleted successfully. Admin accounts preserved.'
      });
    }

    // MySQL implementation
    await db.query('DELETE FROM team_question_progress');
    await db.query('DELETE FROM team_level_status');
    await db.query('DELETE FROM evaluation_audit_log');
    await db.query('DELETE FROM hint_usage');
    await db.query('DELETE FROM team_progress');
    await db.query('DELETE FROM submissions');
    await db.query('DELETE FROM activity_logs');
    await db.query('DELETE FROM refresh_tokens WHERE user_id IN (SELECT id FROM users WHERE role = "team")');
    await db.query('DELETE FROM email_otps');
    await db.query('DELETE FROM team_members');
    await db.query('DELETE FROM teams');
    await db.query('DELETE FROM users WHERE role = "team"');
    
    // Optional: Reset evaluation state
    await db.query('DELETE FROM level_evaluation_state');

    res.json({
      success: true,
      message: 'All team and user data deleted successfully. Admin accounts preserved.'
    });
  } catch (error) {
    console.error('Error deleting all data:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to delete all data: ' + error.message
    });
  }
};
