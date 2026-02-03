// server/services/leaderboardService.js
const db = require('../config/db');

/**
 * Leaderboard Service
 * Handles real-time leaderboard calculations and rankings
 */

/**
 * Get live leaderboard with rankings
 * Ranking formula: puzzles_solved DESC, total_time ASC, hints_used ASC
 */
async function getLiveLeaderboard() {
  const [teams] = await db.query(`
    SELECT 
      t.id,
      t.team_name,
      t.level,
      t.status,
      t.progress,
      t.hints_used,
      t.start_time,
      t.end_time,
      COALESCE(
        (SELECT COUNT(*) FROM team_progress tp WHERE tp.team_id = t.id AND tp.is_completed = true),
        0
      ) as puzzles_solved,
      COALESCE(
        (SELECT SUM(hu.time_penalty_applied) FROM hint_usage hu WHERE hu.team_id = t.id),
        0
      ) as total_penalty_seconds,
      CASE 
        WHEN t.end_time IS NOT NULL THEN TIMESTAMPDIFF(SECOND, t.start_time, t.end_time)
        WHEN t.start_time IS NOT NULL THEN TIMESTAMPDIFF(SECOND, t.start_time, NOW())
        ELSE 0
      END as total_time_seconds
    FROM teams t
    WHERE t.status IN ('active', 'completed')
    ORDER BY 
      puzzles_solved DESC,
      total_time_seconds ASC,
      t.hints_used ASC
  `);

  // Add rankings
  return teams.map((team, index) => ({
    rank: index + 1,
    id: team.id,
    teamName: team.team_name,
    level: team.level,
    status: team.status,
    progress: team.progress,
    puzzlesSolved: team.puzzles_solved,
    hintsUsed: team.hints_used,
    totalTimeSeconds: team.total_time_seconds,
    totalPenaltySeconds: team.total_penalty_seconds,
    effectiveTime: team.total_time_seconds + team.total_penalty_seconds,
    startTime: team.start_time,
    endTime: team.end_time
  }));
}

/**
 * Get team's current rank
 */
async function getTeamRank(teamId) {
  const leaderboard = await getLiveLeaderboard();
  const teamEntry = leaderboard.find(t => t.id === teamId);
  return teamEntry ? teamEntry.rank : null;
}

/**
 * Detect rank changes for a team
 */
async function detectRankChange(teamId, previousRank) {
  const currentRank = await getTeamRank(teamId);
  if (!currentRank || !previousRank) return null;
  
  if (currentRank < previousRank) return { direction: 'up', positions: previousRank - currentRank };
  if (currentRank > previousRank) return { direction: 'down', positions: currentRank - previousRank };
  return { direction: 'same', positions: 0 };
}

module.exports = {
  getLiveLeaderboard,
  getTeamRank,
  detectRankChange
};
