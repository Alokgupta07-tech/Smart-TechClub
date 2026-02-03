// server/routes/featureRoutes.js
const express = require('express');
const router = express.Router();

const leaderboardController = require('../controllers/leaderboardController');
const achievementController = require('../controllers/achievementController');
const analyticsController = require('../controllers/analyticsController');
const notificationController = require('../controllers/notificationController');
const authMiddleware = require('../middleware/auth');
const { adminOnly } = require('../middleware/roleGuard');

/**
 * LEADERBOARD ROUTES (Public/Team)
 */
router.get('/leaderboard', authMiddleware, leaderboardController.getLiveLeaderboard);
router.get('/leaderboard/rank/:teamId', authMiddleware, leaderboardController.getTeamRank);

/**
 * ACHIEVEMENT ROUTES
 */
router.get('/achievements', authMiddleware, achievementController.getAllAchievements);
router.get('/teams/:teamId/achievements', authMiddleware, achievementController.getTeamAchievements);

/**
 * NOTIFICATION ROUTES (Team)
 */
router.get('/notifications', authMiddleware, notificationController.getNotifications);
router.get('/notifications/unread', authMiddleware, notificationController.getUnreadNotifications);
router.patch('/notifications/:notificationId/read', authMiddleware, notificationController.markAsRead);
router.patch('/notifications/read-all', authMiddleware, notificationController.markAllAsRead);

/**
 * ADMIN ROUTES
 */
router.use('/admin', authMiddleware, adminOnly);

// Achievement management
router.post('/admin/achievements/:teamId/award', achievementController.awardAchievement);

// Analytics
router.get('/admin/puzzle/:puzzleId/stats', analyticsController.getPuzzleStats);
router.get('/admin/analytics/puzzles', analyticsController.getAllPuzzleStats);

// Suspicious activity
router.get('/admin/suspicious', analyticsController.getSuspiciousAlerts);
router.patch('/admin/suspicious/:alertId/review', analyticsController.reviewAlert);

// Team timeline
router.get('/admin/team/:teamId/timeline', analyticsController.getTeamTimeline);

// Broadcast
router.post('/admin/notifications/broadcast', notificationController.broadcastNotification);

module.exports = router;
