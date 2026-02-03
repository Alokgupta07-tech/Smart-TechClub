// server/controllers/achievementController.js
const achievementService = require('../services/achievementService');

/**
 * GET /api/teams/:teamId/achievements
 * Get achievements for a team
 */
exports.getTeamAchievements = async (req, res) => {
  try {
    const { teamId } = req.params;
    const achievements = await achievementService.getTeamAchievements(teamId);
    res.json(achievements);
  } catch (error) {
    console.error('Get achievements error:', error);
    res.status(500).json({ error: 'Failed to fetch achievements' });
  }
};

/**
 * GET /api/achievements
 * Get all achievements with team progress
 */
exports.getAllAchievements = async (req, res) => {
  try {
    const teamId = req.user?.teamId;
    const achievements = await achievementService.getAllAchievementsWithProgress(teamId);
    res.json(achievements);
  } catch (error) {
    console.error('Get all achievements error:', error);
    res.status(500).json({ error: 'Failed to fetch achievements' });
  }
};

/**
 * POST /api/admin/achievements/:teamId/award
 * Manually award achievement (admin only)
 */
exports.awardAchievement = async (req, res) => {
  try {
    const { teamId } = req.params;
    const { achievementId } = req.body;
    const awardedBy = req.user.id;

    if (!achievementId) {
      return res.status(400).json({ error: 'Achievement ID required' });
    }

    const awarded = await achievementService.awardAchievement(teamId, achievementId, awardedBy);
    
    if (!awarded) {
      return res.status(400).json({ error: 'Achievement already awarded or not found' });
    }

    res.json({ success: true, message: 'Achievement awarded' });
  } catch (error) {
    console.error('Award achievement error:', error);
    res.status(500).json({ error: 'Failed to award achievement' });
  }
};
