const express = require('express');
const router = express.Router();
const puzzleController = require('../controllers/puzzleController');
const { authenticateToken, requireRole } = require('../middleware/auth');

// Require admin role for all puzzle management routes
router.use(authenticateToken, requireRole('admin'));

// Puzzle CRUD routes
router.get('/', puzzleController.getAllPuzzles);
router.get('/:id', puzzleController.getPuzzleById);
router.post('/', puzzleController.createPuzzle);
router.put('/:id', puzzleController.updatePuzzle);
router.delete('/:id', puzzleController.deletePuzzle);

// Hint management routes
router.post('/hints', puzzleController.addHint);
router.put('/hints/:id', puzzleController.updateHint);
router.delete('/hints/:id', puzzleController.deleteHint);

module.exports = router;
