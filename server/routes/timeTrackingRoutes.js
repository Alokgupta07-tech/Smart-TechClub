/**
 * Time Tracking Routes
 * =====================
 * Routes for time tracking and skip functionality
 */

const express = require('express');
const router = express.Router();
const timeTrackingController = require('../controllers/timeTrackingController');
const teamGameController = require('../controllers/teamGameController');
const { authenticateToken } = require('../middleware/auth');
const { adminOnly } = require('../middleware/roleGuard');

// ============================================
// TEAM ROUTES (Require authentication)
// ============================================

// Question timer operations
router.post('/start-question', authenticateToken, timeTrackingController.startQuestion);
router.post('/pause-question', authenticateToken, timeTrackingController.pauseQuestion);
router.post('/resume-question', authenticateToken, timeTrackingController.resumeQuestion);
router.post('/complete-question', authenticateToken, timeTrackingController.completeQuestion);

// Skip operations
router.post('/skip-question', authenticateToken, timeTrackingController.skipQuestion);
router.post('/unskip-question', authenticateToken, timeTrackingController.unskipQuestion);
router.post('/go-to-question', authenticateToken, timeTrackingController.goToQuestion);
router.get('/skipped-questions', authenticateToken, timeTrackingController.getSkippedQuestions);

// Session operations
router.post('/end-session', authenticateToken, timeTrackingController.endSession);
router.get('/session', authenticateToken, timeTrackingController.getSessionState);

// Timer state
router.get('/timer/:puzzleId', authenticateToken, timeTrackingController.getTimerState);
router.post('/sync-timer', authenticateToken, timeTrackingController.syncTimer);

// Game summary (show before end game)
router.get('/game-summary', authenticateToken, teamGameController.getGameSummary);

module.exports = router;
