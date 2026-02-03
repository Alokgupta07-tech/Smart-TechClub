// server/controllers/analyticsController.js
const analyticsService = require('../services/analyticsService');
const db = require('../config/db');

/**
 * GET /api/admin/puzzle/:puzzleId/stats
 * Get puzzle analytics (admin only)
 */
exports.getPuzzleStats = async (req, res) => {
  try {
    const { puzzleId } = req.params;
    const stats = await analyticsService.getPuzzleAnalytics(puzzleId);
    res.json(stats);
  } catch (error) {
    console.error('Get puzzle stats error:', error);
    res.status(500).json({ error: 'Failed to fetch puzzle statistics' });
  }
};

/**
 * GET /api/admin/analytics/puzzles
 * Get analytics for all puzzles (admin only)
 */
exports.getAllPuzzleStats = async (req, res) => {
  try {
    const [puzzles] = await db.query('SELECT id FROM puzzles WHERE is_active = true');
    
    const stats = await Promise.all(
      puzzles.map(p => analyticsService.getPuzzleAnalytics(p.id))
    );
    
    res.json(stats);
  } catch (error) {
    console.error('Get all puzzle stats error:', error);
    res.status(500).json({ error: 'Failed to fetch puzzle statistics' });
  }
};

/**
 * GET /api/admin/suspicious
 * Get suspicious activity alerts (admin only)
 */
exports.getSuspiciousAlerts = async (req, res) => {
  try {
    const { unreviewedOnly, limit } = req.query;
    const alerts = await analyticsService.getSuspiciousAlerts(
      parseInt(limit) || 50,
      unreviewedOnly === 'true'
    );
    res.json(alerts);
  } catch (error) {
    console.error('Get suspicious alerts error:', error);
    res.status(500).json({ error: 'Failed to fetch alerts' });
  }
};

/**
 * PATCH /api/admin/suspicious/:alertId/review
 * Mark alert as reviewed (admin only)
 */
exports.reviewAlert = async (req, res) => {
  try {
    const { alertId } = req.params;
    await analyticsService.reviewAlert(alertId, req.user.id);
    res.json({ success: true, message: 'Alert marked as reviewed' });
  } catch (error) {
    console.error('Review alert error:', error);
    res.status(500).json({ error: 'Failed to review alert' });
  }
};

/**
 * GET /api/admin/team/:teamId/timeline
 * Get team activity timeline (admin only)
 */
exports.getTeamTimeline = async (req, res) => {
  try {
    const { teamId } = req.params;
    const { limit } = req.query;

    const [activities] = await db.query(`
      SELECT 
        al.id,
        al.action_type,
        al.description,
        al.puzzle_id,
        al.metadata,
        al.created_at,
        p.title as puzzle_title
      FROM activity_logs al
      LEFT JOIN puzzles p ON al.puzzle_id = p.id
      WHERE al.team_id = ?
      ORDER BY al.created_at DESC
      LIMIT ?
    `, [teamId, parseInt(limit) || 100]);

    res.json(activities);
  } catch (error) {
    console.error('Get team timeline error:', error);
    res.status(500).json({ error: 'Failed to fetch team timeline' });
  }
};
