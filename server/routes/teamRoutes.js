const express = require('express');
const router = express.Router();
const teamController = require('../controllers/teamController');
const authMiddleware = require('../middleware/auth');
const { teamOnly } = require('../middleware/roleGuard');

/**
 * TEAM ROUTES
 * All endpoints require team authentication
 */

// All routes protected by authMiddleware + teamOnly
router.use(authMiddleware);
router.use(teamOnly);

// Team endpoints
router.get('/me', teamController.getMyTeam);
router.put('/name', teamController.updateTeamName);
router.get('/profile', teamController.getProfile);
router.post('/2fa', teamController.toggle2FA);

module.exports = router;
