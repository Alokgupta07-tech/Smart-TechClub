const express = require('express');
const router = express.Router();
const adminController = require('../controllers/adminController');
const timeTrackingController = require('../controllers/timeTrackingController');
const authMiddleware = require('../middleware/auth');
const { adminOnly } = require('../middleware/roleGuard');

/**
 * ADMIN ROUTES
 * All endpoints require admin authentication
 */

// All routes protected by authMiddleware + adminOnly
router.use(authMiddleware);
router.use(adminOnly);

// Admin endpoints
router.get('/audit-logs', adminController.getAudit);
router.get('/alerts', adminController.getAlerts);
router.get('/teams', adminController.getAllTeams);
router.get('/teams/:id', adminController.getTeamById);
router.put('/teams/:id/status', adminController.updateTeamStatus);
router.post('/teams/:id/qualify-level2', adminController.qualifyTeamForLevel2);
router.delete('/teams/:id', adminController.deleteTeam);
router.patch('/team/:id/action', adminController.teamAction);
router.get('/stats', adminController.getStats);

// Live monitoring
router.get('/monitor/live', adminController.getLiveMonitoring);
router.get('/activity', adminController.getActivityLogs);
router.get('/suspicious', adminController.getSuspiciousActivity);
router.get('/export/results', adminController.exportResults);
router.get('/team-members', adminController.getTeamMembers);

// Time tracking admin endpoints
router.get('/team-timings', timeTrackingController.getAdminTeamTimings);
router.get('/team-timings/:teamId', timeTrackingController.getTeamTimingDetails);
router.get('/question-analytics', timeTrackingController.getQuestionAnalytics);
router.get('/game-settings', timeTrackingController.getGameSettings);
router.put('/game-settings/:key', timeTrackingController.updateGameSetting);
router.post('/team/:teamId/end-session', timeTrackingController.adminEndTeamSession);
router.post('/team/:teamId/recalculate-time', timeTrackingController.recalculateTeamTime);

module.exports = router;
