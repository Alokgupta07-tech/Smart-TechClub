// server/services/notificationService.js
const db = require('../config/db');
const { supabaseAdmin } = require('../config/supabase');
const { v4: uuidv4 } = require('uuid');
const USE_SUPABASE = process.env.USE_SUPABASE === 'true';

/**
 * Notification Service
 * Handles in-game notifications for teams
 */

/**
 * Check if error is a table/column not found error
 * Works for both MySQL and PostgreSQL/Supabase
 */
function isTableNotFoundError(error) {
  if (!error) return false;
  if (error.code === 'ER_NO_SUCH_TABLE' || error.code === 'ER_BAD_FIELD_ERROR') return true;
  if (error.code === '42P01' || error.code === '42703' || error.code === 'PGRST205') return true;
  if (error.message && (error.message.includes('does not exist') || error.message.includes('Could not find'))) return true;
  return false;
}

/**
 * Create a notification
 */
async function createNotification(teamId, type, title, message, priority = 'normal', metadata = null) {
  if (USE_SUPABASE) {
    try {
      const { data, error } = await supabaseAdmin
        .from('notifications')
        .insert({
          id: uuidv4(),
          team_id: teamId,
          notification_type: type,
          title,
          message,
          priority,
          metadata: metadata || null
        })
        .select('id')
        .single();

      if (error) {
        console.error('Supabase create notification error:', error.message);
        return null;
      }
      return data?.id || null;
    } catch (error) {
      console.error('Create notification error (Supabase):', error.message);
      return null;
    }
  }

  // MySQL fallback
  try {
    const [result] = await db.query(`
      INSERT INTO notifications (id, team_id, notification_type, title, message, priority, metadata)
      VALUES (UUID(), ?, ?, ?, ?, ?, ?)
    `, [teamId, type, title, message, priority, metadata ? JSON.stringify(metadata) : null]);
    
    return result.insertId;
  } catch (error) {
    console.error('Create notification error:', error);
    return null;
  }
}

/**
 * Create broadcast notification for all teams
 */
async function createBroadcastNotification(title, message, priority = 'high') {
  if (USE_SUPABASE) {
    try {
      const { data: teams, error: teamsError } = await supabaseAdmin
        .from('teams')
        .select('id')
        .in('status', ['active', 'waiting']);

      if (teamsError || !teams) {
        console.error('Supabase broadcast teams fetch error:', teamsError?.message);
        return 0;
      }

      for (const team of teams) {
        await createNotification(team.id, 'broadcast', title, message, priority);
      }

      return teams.length;
    } catch (error) {
      console.error('Broadcast notification error (Supabase):', error.message);
      return 0;
    }
  }

  // MySQL fallback
  try {
    const [teams] = await db.query("SELECT id FROM teams WHERE status IN ('active', 'waiting')");
    
    for (const team of teams) {
      await createNotification(team.id, 'broadcast', title, message, priority);
    }
    
    return teams.length;
  } catch (error) {
    console.error('Broadcast notification error:', error);
    return 0;
  }
}

/**
 * Get unread notifications for a team
 */
async function getUnreadNotifications(teamId) {
  if (USE_SUPABASE) {
    try {
      const { data: notifications, error } = await supabaseAdmin
        .from('notifications')
        .select('*')
        .eq('team_id', teamId)
        .eq('is_read', false)
        .order('created_at', { ascending: false });

      if (error) {
        console.error('Supabase unread notifications error:', error.message);
        return [];
      }

      // Filter expired notifications in JS
      const now = new Date();
      return (notifications || []).filter(n => !n.expires_at || new Date(n.expires_at) > now);
    } catch (error) {
      console.error('getUnreadNotifications error (Supabase):', error.message);
      return [];
    }
  }

  // MySQL fallback
  try {
    const [notifications] = await db.query(`
      SELECT * FROM notifications
      WHERE team_id = ? AND is_read = false
      AND (expires_at IS NULL OR expires_at > NOW())
      ORDER BY created_at DESC
    `, [teamId]);
    
    return notifications;
  } catch (error) {
    if (isTableNotFoundError(error)) {
      return [];
    }
    throw error;
  }
}

/**
 * Get all notifications for a team
 */
async function getTeamNotifications(teamId, limit = 50) {
  if (USE_SUPABASE) {
    try {
      const { data: notifications, error } = await supabaseAdmin
        .from('notifications')
        .select('*')
        .eq('team_id', teamId)
        .order('created_at', { ascending: false })
        .limit(limit);

      if (error) {
        console.error('Supabase team notifications error:', error.message);
        return [];
      }

      return notifications || [];
    } catch (error) {
      console.error('getTeamNotifications error (Supabase):', error.message);
      return [];
    }
  }

  // MySQL fallback
  const [notifications] = await db.query(`
    SELECT * FROM notifications
    WHERE team_id = ?
    ORDER BY created_at DESC
    LIMIT ?
  `, [teamId, limit]);
  
  return notifications;
}

/**
 * Mark notification as read
 */
async function markAsRead(notificationId, teamId) {
  if (USE_SUPABASE) {
    try {
      const { error } = await supabaseAdmin
        .from('notifications')
        .update({ is_read: true, read_at: new Date().toISOString() })
        .eq('id', notificationId)
        .eq('team_id', teamId);

      if (error) {
        console.error('Supabase markAsRead error:', error.message);
      }
      return;
    } catch (error) {
      console.error('markAsRead error (Supabase):', error.message);
      return;
    }
  }

  // MySQL fallback
  await db.query(`
    UPDATE notifications
    SET is_read = true, read_at = NOW()
    WHERE id = ? AND team_id = ?
  `, [notificationId, teamId]);
}

/**
 * Mark all notifications as read for a team
 */
async function markAllAsRead(teamId) {
  if (USE_SUPABASE) {
    try {
      const { error } = await supabaseAdmin
        .from('notifications')
        .update({ is_read: true, read_at: new Date().toISOString() })
        .eq('team_id', teamId)
        .eq('is_read', false);

      if (error) {
        console.error('Supabase markAllAsRead error:', error.message);
      }
      return;
    } catch (error) {
      console.error('markAllAsRead error (Supabase):', error.message);
      return;
    }
  }

  // MySQL fallback
  await db.query(`
    UPDATE notifications
    SET is_read = true, read_at = NOW()
    WHERE team_id = ? AND is_read = false
  `, [teamId]);
}

/**
 * Notify rank change
 */
async function notifyRankChange(teamId, oldRank, newRank) {
  const direction = newRank < oldRank ? 'up' : 'down';
  const positions = Math.abs(newRank - oldRank);
  
  const title = direction === 'up' 
    ? `🚀 Moved Up ${positions} Position${positions > 1 ? 's' : ''}!`
    : `📉 Dropped ${positions} Position${positions > 1 ? 's' : ''}`;
  
  const message = `You are now ranked #${newRank}`;
  const priority = direction === 'up' ? 'high' : 'normal';
  
  await createNotification(teamId, 'rank_change', title, message, priority, {
    oldRank,
    newRank,
    direction,
    positions
  });
}

/**
 * Notify hint penalty
 */
async function notifyHintPenalty(teamId, hintNumber, penaltySeconds) {
  const penaltyMinutes = Math.floor(penaltySeconds / 60);
  await createNotification(
    teamId,
    'hint_penalty',
    `Hint ${hintNumber} Unlocked`,
    `Time penalty: +${penaltyMinutes} minute${penaltyMinutes > 1 ? 's' : ''}`,
    'normal',
    { hintNumber, penaltySeconds }
  );
}

module.exports = {
  createNotification,
  createBroadcastNotification,
  getUnreadNotifications,
  getTeamNotifications,
  markAsRead,
  markAllAsRead,
  notifyRankChange,
  notifyHintPenalty
};
