const express = require('express');
const router = express.Router();
const adminController = require('../controllers/adminController');
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
router.put('/teams/:id/status', adminController.updateTeamStatus);router.delete('/teams/:id', adminController.deleteTeam);router.patch('/team/:id/action', adminController.teamAction);
router.get('/stats', adminController.getStats);

// Live monitoring
router.get('/monitor/live', adminController.getLiveMonitoring);
router.get('/activity', adminController.getActivityLogs);
router.get('/suspicious', adminController.getSuspiciousActivity);
router.get('/export/results', adminController.exportResults);

module.exports = router;
