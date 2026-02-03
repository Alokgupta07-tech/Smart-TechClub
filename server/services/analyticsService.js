// server/services/analyticsService.js
const db = require('../config/db');

/**
 * Analytics Service
 * Puzzle analytics and suspicious activity detection
 */

/**
 * Get puzzle analytics
 */
async function getPuzzleAnalytics(puzzleId) {
  // Get submission stats
  const [[stats]] = await db.query(`
    SELECT 
      COUNT(*) as total_attempts,
      SUM(is_correct) as successful_attempts,
      AVG(time_taken_seconds) as avg_solve_time,
      MIN(CASE WHEN is_correct = true THEN time_taken_seconds END) as min_solve_time,
      MAX(CASE WHEN is_correct = true THEN time_taken_seconds END) as max_solve_time
    FROM submissions
    WHERE puzzle_id = ?
  `, [puzzleId]);

  // Get hint usage stats
  const [[hintStats]] = await db.query(`
    SELECT COUNT(DISTINCT team_id) as teams_used_hints
    FROM hint_usage
    WHERE puzzle_id = ?
  `, [puzzleId]);

  // Get total teams attempted
  const [[teamStats]] = await db.query(`
    SELECT COUNT(DISTINCT team_id) as teams_attempted
    FROM submissions
    WHERE puzzle_id = ?
  `, [puzzleId]);

  const totalAttempts = stats.total_attempts || 0;
  const successfulAttempts = stats.successful_attempts || 0;
  const failureRate = totalAttempts > 0 
    ? ((totalAttempts - successfulAttempts) / totalAttempts * 100).toFixed(2)
    : 0;
  const hintUsageRate = teamStats.teams_attempted > 0
    ? (hintStats.teams_used_hints / teamStats.teams_attempted * 100).toFixed(2)
    : 0;

  return {
    puzzleId,
    totalAttempts,
    successfulAttempts,
    avgSolveTimeSeconds: Math.round(stats.avg_solve_time || 0),
    minSolveTimeSeconds: stats.min_solve_time || 0,
    maxSolveTimeSeconds: stats.max_solve_time || 0,
    failureRate: parseFloat(failureRate),
    hintUsageRate: parseFloat(hintUsageRate),
    teamsAttempted: teamStats.teams_attempted,
    teamsUsedHints: hintStats.teams_used_hints
  };
}

/**
 * Update puzzle analytics cache
 */
async function updatePuzzleAnalytics(puzzleId) {
  const analytics = await getPuzzleAnalytics(puzzleId);
  
  await db.query(`
    INSERT INTO puzzle_analytics 
      (id, puzzle_id, total_attempts, successful_attempts, avg_solve_time_seconds, 
       min_solve_time_seconds, max_solve_time_seconds, failure_rate, hint_usage_rate)
    VALUES (UUID(), ?, ?, ?, ?, ?, ?, ?, ?)
    ON DUPLICATE KEY UPDATE
      total_attempts = VALUES(total_attempts),
      successful_attempts = VALUES(successful_attempts),
      avg_solve_time_seconds = VALUES(avg_solve_time_seconds),
      min_solve_time_seconds = VALUES(min_solve_time_seconds),
      max_solve_time_seconds = VALUES(max_solve_time_seconds),
      failure_rate = VALUES(failure_rate),
      hint_usage_rate = VALUES(hint_usage_rate)
  `, [
    puzzleId, 
    analytics.totalAttempts, 
    analytics.successfulAttempts,
    analytics.avgSolveTimeSeconds,
    analytics.minSolveTimeSeconds,
    analytics.maxSolveTimeSeconds,
    analytics.failureRate,
    analytics.hintUsageRate
  ]);

  return analytics;
}

/**
 * Detect suspicious activity
 */
async function detectSuspiciousActivity(teamId, eventType, eventData = {}) {
  const alerts = [];

  try {
    // Check for rapid submissions (>10 per minute)
    if (eventType === 'submission') {
      const [[recentSubmissions]] = await db.query(`
        SELECT COUNT(*) as count
        FROM submissions
        WHERE team_id = ? AND submitted_at > DATE_SUB(NOW(), INTERVAL 1 MINUTE)
      `, [teamId]);

      if (recentSubmissions.count > 10) {
        alerts.push({
          type: 'rapid_submission',
          severity: 'high',
          description: `${recentSubmissions.count} submissions in the last minute`,
          metadata: { count: recentSubmissions.count }
        });
      }
    }

    // Check for suspiciously fast solve
    if (eventType === 'puzzle_solve' && eventData.solveTimeSeconds) {
      // Get puzzle's average solve time
      const [[avgTime]] = await db.query(`
        SELECT AVG(time_taken_seconds) as avg_time
        FROM submissions
        WHERE puzzle_id = ? AND is_correct = true
      `, [eventData.puzzleId]);

      const avgSolveTime = avgTime.avg_time || 300;
      const threshold = avgSolveTime * 0.2; // 20% of average

      if (eventData.solveTimeSeconds < threshold && eventData.solveTimeSeconds < 30) {
        alerts.push({
          type: 'fast_solve',
          severity: 'medium',
          description: `Solved in ${eventData.solveTimeSeconds}s (avg: ${Math.round(avgSolveTime)}s)`,
          metadata: { 
            solveTime: eventData.solveTimeSeconds, 
            avgTime: avgSolveTime,
            puzzleId: eventData.puzzleId
          }
        });
      }
    }

    // Log alerts
    for (const alert of alerts) {
      await db.query(`
        INSERT INTO suspicious_alerts (id, team_id, alert_type, severity, description, metadata)
        VALUES (UUID(), ?, ?, ?, ?, ?)
      `, [teamId, alert.type, alert.severity, alert.description, JSON.stringify(alert.metadata)]);

      // Also log to activity_logs
      await db.query(`
        INSERT INTO activity_logs (id, team_id, action_type, description, metadata)
        VALUES (UUID(), ?, 'suspicious_activity', ?, ?)
      `, [teamId, alert.description, JSON.stringify(alert)]);
    }

    return alerts;
  } catch (error) {
    console.error('Suspicious activity detection error:', error);
    return [];
  }
}

/**
 * Get suspicious alerts for admin
 */
async function getSuspiciousAlerts(limit = 50, unreviewedOnly = false) {
  let query = `
    SELECT sa.*, t.team_name
    FROM suspicious_alerts sa
    JOIN teams t ON sa.team_id = t.id
  `;
  
  if (unreviewedOnly) {
    query += ' WHERE sa.is_reviewed = false';
  }
  
  query += ' ORDER BY sa.created_at DESC LIMIT ?';

  const [alerts] = await db.query(query, [limit]);
  return alerts;
}

/**
 * Mark alert as reviewed
 */
async function reviewAlert(alertId, reviewerId) {
  await db.query(`
    UPDATE suspicious_alerts
    SET is_reviewed = true, reviewed_by = ?, reviewed_at = NOW()
    WHERE id = ?
  `, [reviewerId, alertId]);
}

module.exports = {
  getPuzzleAnalytics,
  updatePuzzleAnalytics,
  detectSuspiciousActivity,
  getSuspiciousAlerts,
  reviewAlert
};
