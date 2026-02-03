// server/services/achievementService.js
const db = require('../config/db');

/**
 * Achievement Service
 * Handles automatic achievement detection and awarding
 */

/**
 * Check and award achievements based on event
 */
async function checkAndAwardAchievements(teamId, eventType, eventData = {}) {
  try {
    const [achievements] = await db.query(
      'SELECT * FROM achievements WHERE is_active = true AND trigger_type = ?',
      ['auto']
    );

    for (const achievement of achievements) {
      const condition = achievement.trigger_condition;
      if (!condition) continue;

      const shouldAward = await evaluateCondition(teamId, condition, eventType, eventData);
      if (shouldAward) {
        await awardAchievement(teamId, achievement.id);
      }
    }
  } catch (error) {
    console.error('Achievement check error:', error);
  }
}

/**
 * Evaluate achievement condition
 */
async function evaluateCondition(teamId, condition, eventType, eventData) {
  const { type } = condition;

  switch (type) {
    case 'first_solve':
      if (eventType !== 'puzzle_solve') return false;
      const [firstSolve] = await db.query(
        'SELECT COUNT(*) as count FROM team_progress WHERE puzzle_id = ? AND is_completed = true',
        [eventData.puzzleId]
      );
      return firstSolve[0].count === 1;

    case 'solve_time':
      if (eventType !== 'puzzle_solve') return false;
      return eventData.solveTimeSeconds && eventData.solveTimeSeconds <= condition.max_seconds;

    case 'no_hints_level':
      if (eventType !== 'level_complete') return false;
      const [hintsUsed] = await db.query(
        `SELECT COUNT(*) as count FROM hint_usage hu
         JOIN puzzles p ON hu.puzzle_id = p.id
         WHERE hu.team_id = ? AND p.level = ?`,
        [teamId, eventData.level]
      );
      return hintsUsed[0].count === 0;

    case 'level_complete':
      if (eventType !== 'level_complete') return false;
      return eventData.level === condition.level;

    case 'perfect_accuracy':
      if (eventType !== 'game_complete') return false;
      const [submissions] = await db.query(
        'SELECT COUNT(*) as total, SUM(is_correct) as correct FROM submissions WHERE team_id = ?',
        [teamId]
      );
      return submissions[0].total > 0 && submissions[0].total === submissions[0].correct;

    case 'total_time':
      if (eventType !== 'game_complete') return false;
      return eventData.totalTimeSeconds && eventData.totalTimeSeconds <= condition.max_seconds;

    case 'first_start':
      if (eventType !== 'game_start') return false;
      const [activeCount] = await db.query(
        "SELECT COUNT(*) as count FROM teams WHERE status = 'active'"
      );
      return activeCount[0].count === 1;

    default:
      return false;
  }
}

/**
 * Award achievement to team
 */
async function awardAchievement(teamId, achievementId, awardedBy = null) {
  try {
    // Check if already awarded
    const [existing] = await db.query(
      'SELECT id FROM team_achievements WHERE team_id = ? AND achievement_id = ?',
      [teamId, achievementId]
    );
    
    if (existing.length > 0) return false;

    await db.query(
      'INSERT INTO team_achievements (id, team_id, achievement_id, awarded_by) VALUES (UUID(), ?, ?, ?)',
      [teamId, achievementId, awardedBy]
    );

    // Create notification
    const [achievement] = await db.query('SELECT name, description FROM achievements WHERE id = ?', [achievementId]);
    if (achievement.length > 0) {
      await db.query(
        `INSERT INTO notifications (id, team_id, notification_type, title, message, priority)
         VALUES (UUID(), ?, 'achievement', ?, ?, 'high')`,
        [teamId, `Achievement Unlocked: ${achievement[0].name}`, achievement[0].description]
      );
    }

    return true;
  } catch (error) {
    console.error('Award achievement error:', error);
    return false;
  }
}

/**
 * Get team achievements
 */
async function getTeamAchievements(teamId) {
  const [achievements] = await db.query(
    `SELECT a.*, ta.awarded_at, ta.metadata
     FROM achievements a
     JOIN team_achievements ta ON a.id = ta.achievement_id
     WHERE ta.team_id = ?
     ORDER BY ta.awarded_at DESC`,
    [teamId]
  );
  return achievements;
}

/**
 * Get all achievements with team progress
 */
async function getAllAchievementsWithProgress(teamId) {
  const [achievements] = await db.query(
    `SELECT a.*, 
       CASE WHEN ta.id IS NOT NULL THEN true ELSE false END as earned,
       ta.awarded_at
     FROM achievements a
     LEFT JOIN team_achievements ta ON a.id = ta.achievement_id AND ta.team_id = ?
     WHERE a.is_active = true
     ORDER BY earned DESC, a.points DESC`,
    [teamId]
  );
  return achievements;
}

module.exports = {
  checkAndAwardAchievements,
  awardAchievement,
  getTeamAchievements,
  getAllAchievementsWithProgress
};
