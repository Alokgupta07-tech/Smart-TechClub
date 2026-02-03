// server/controllers/notificationController.js
const notificationService = require('../services/notificationService');
const db = require('../config/db');

/**
 * GET /api/notifications
 * Get notifications for current team
 */
exports.getNotifications = async (req, res) => {
  try {
    const teamId = req.user.teamId;
    
    if (!teamId) {
      return res.status(400).json({ error: 'Team ID required' });
    }

    const notifications = await notificationService.getTeamNotifications(teamId);
    res.json(notifications);
  } catch (error) {
    console.error('Get notifications error:', error);
    res.status(500).json({ error: 'Failed to fetch notifications' });
  }
};

/**
 * GET /api/notifications/unread
 * Get unread notifications count and list
 */
exports.getUnreadNotifications = async (req, res) => {
  try {
    const teamId = req.user.teamId;
    
    if (!teamId) {
      return res.status(400).json({ error: 'Team ID required' });
    }

    const notifications = await notificationService.getUnreadNotifications(teamId);
    res.json({
      count: notifications.length,
      notifications
    });
  } catch (error) {
    console.error('Get unread notifications error:', error);
    res.status(500).json({ error: 'Failed to fetch notifications' });
  }
};

/**
 * PATCH /api/notifications/:notificationId/read
 * Mark notification as read
 */
exports.markAsRead = async (req, res) => {
  try {
    const { notificationId } = req.params;
    const teamId = req.user.teamId;
    
    await notificationService.markAsRead(notificationId, teamId);
    res.json({ success: true });
  } catch (error) {
    console.error('Mark as read error:', error);
    res.status(500).json({ error: 'Failed to mark notification as read' });
  }
};

/**
 * PATCH /api/notifications/read-all
 * Mark all notifications as read
 */
exports.markAllAsRead = async (req, res) => {
  try {
    const teamId = req.user.teamId;
    await notificationService.markAllAsRead(teamId);
    res.json({ success: true });
  } catch (error) {
    console.error('Mark all as read error:', error);
    res.status(500).json({ error: 'Failed to mark notifications as read' });
  }
};

/**
 * POST /api/admin/notifications/broadcast
 * Send broadcast notification (admin only)
 */
exports.broadcastNotification = async (req, res) => {
  try {
    const { title, message, priority } = req.body;

    if (!title || !message) {
      return res.status(400).json({ error: 'Title and message required' });
    }

    const count = await notificationService.createBroadcastNotification(title, message, priority);
    res.json({ success: true, notifiedTeams: count });
  } catch (error) {
    console.error('Broadcast notification error:', error);
    res.status(500).json({ error: 'Failed to send broadcast' });
  }
};
