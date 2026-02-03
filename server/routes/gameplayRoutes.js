const express = require('express');
const router = express.Router();
const teamGameController = require('../controllers/teamGameController');
const { authenticateToken, requireRole } = require('../middleware/auth');
const hintService = require('../services/hintService');
const puzzleTimerService = require('../services/puzzleTimerService');

// All routes require team authentication
router.use(authenticateToken, requireRole('team'));

// Puzzle gameplay routes
router.get('/puzzle/current', teamGameController.getCurrentPuzzle);
router.post('/puzzle/submit', teamGameController.submitAnswer);
router.post('/puzzle/hint', teamGameController.requestHint);

// Team progress and stats
router.get('/progress', teamGameController.getTeamProgress);
router.get('/inventory', teamGameController.getInventory);
router.post('/inventory', teamGameController.addInventoryItem);
router.get('/logs', teamGameController.getActivityLogs);

// Progressive Hints
router.get('/puzzle/:puzzleId/hints', async (req, res) => {
  try {
    const teamId = req.user.teamId;
    const { puzzleId } = req.params;
    const hints = await hintService.getAvailableHints(teamId, puzzleId);
    res.json(hints);
  } catch (error) {
    console.error('Get hints error:', error);
    res.status(500).json({ error: 'Failed to fetch hints' });
  }
});

router.post('/puzzle/:puzzleId/hint/:hintId', async (req, res) => {
  try {
    const teamId = req.user.teamId;
    const { puzzleId, hintId } = req.params;
    const result = await hintService.useHint(teamId, puzzleId, hintId);
    res.json(result);
  } catch (error) {
    console.error('Use hint error:', error);
    res.status(400).json({ error: error.message || 'Failed to use hint' });
  }
});

// Puzzle Timer
router.get('/puzzle/:puzzleId/timer', async (req, res) => {
  try {
    const teamId = req.user.teamId;
    const { puzzleId } = req.params;
    const status = await puzzleTimerService.getPuzzleTimerStatus(teamId, puzzleId);
    res.json(status || { error: 'Puzzle not found' });
  } catch (error) {
    console.error('Get timer error:', error);
    res.status(500).json({ error: 'Failed to fetch timer' });
  }
});

router.post('/puzzle/:puzzleId/timer/start', async (req, res) => {
  try {
    const teamId = req.user.teamId;
    const { puzzleId } = req.params;
    const result = await puzzleTimerService.startPuzzleTimer(teamId, puzzleId);
    res.json(result);
  } catch (error) {
    console.error('Start timer error:', error);
    res.status(500).json({ error: 'Failed to start timer' });
  }
});

module.exports = router;
