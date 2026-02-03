const express = require('express');
const router = express.Router();
const gameController = require('../controllers/gameController');
const { authenticateToken, requireRole } = require('../middleware/auth');

// Game state (public for teams to check)
router.get('/state', authenticateToken, gameController.getGameState);
router.get('/broadcast', authenticateToken, gameController.getBroadcastMessages);

// Admin-only game control routes
router.post('/start', authenticateToken, requireRole('admin'), gameController.startGame);
router.post('/level2/unlock', authenticateToken, requireRole('admin'), gameController.unlockLevel2);
router.post('/pause', authenticateToken, requireRole('admin'), gameController.pauseGame);
router.post('/resume', authenticateToken, requireRole('admin'), gameController.resumeGame);
router.post('/end', authenticateToken, requireRole('admin'), gameController.endGame);
router.post('/restart', authenticateToken, requireRole('admin'), gameController.restartGame);
router.post('/broadcast', authenticateToken, requireRole('admin'), gameController.broadcastMessage);

// Team-specific controls (admin only)
router.post('/team/:teamId/pause', authenticateToken, requireRole('admin'), gameController.pauseTeam);
router.post('/team/:teamId/resume', authenticateToken, requireRole('admin'), gameController.resumeTeam);
router.post('/team/:teamId/skip/:puzzleId', authenticateToken, requireRole('admin'), gameController.skipPuzzle);
router.post('/team/:teamId/reset', authenticateToken, requireRole('admin'), gameController.resetTeamProgress);

module.exports = router;
