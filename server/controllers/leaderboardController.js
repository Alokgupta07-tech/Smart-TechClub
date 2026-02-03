// server/controllers/leaderboardController.js
const leaderboardService = require('../services/leaderboardService');

/**
 * GET /api/game/leaderboard
 * Public endpoint for live leaderboard
 */
exports.getLiveLeaderboard = async (req, res) => {
  try {
    const leaderboard = await leaderboardService.getLiveLeaderboard();
    res.json(leaderboard);
  } catch (error) {
    console.error('Leaderboard error:', error);
    res.status(500).json({ error: 'Failed to fetch leaderboard' });
  }
};

/**
 * GET /api/game/leaderboard/rank/:teamId
 * Get specific team's rank
 */
exports.getTeamRank = async (req, res) => {
  try {
    const { teamId } = req.params;
    const rank = await leaderboardService.getTeamRank(teamId);
    
    if (rank === null) {
      return res.status(404).json({ error: 'Team not found in leaderboard' });
    }
    
    res.json({ teamId, rank });
  } catch (error) {
    console.error('Get team rank error:', error);
    res.status(500).json({ error: 'Failed to get team rank' });
  }
};
