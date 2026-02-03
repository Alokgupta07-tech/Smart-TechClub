// server/services/notificationService.js
const db = require('../config/db');

/**
 * Notification Service
 * Handles in-game notifications for teams
 */

/**
 * Create a notification
 */
async function createNotification(teamId, type, title, message, priority = 'normal', metadata = null) {
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
  const [notifications] = await db.query(`
    SELECT * FROM notifications
    WHERE team_id = ? AND is_read = false
    AND (expires_at IS NULL OR expires_at > NOW())
    ORDER BY created_at DESC
  `, [teamId]);
  
  return notifications;
}

/**
 * Get all notifications for a team
 */
async function getTeamNotifications(teamId, limit = 50) {
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
