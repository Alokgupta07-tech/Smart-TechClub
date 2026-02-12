// server/services/leaderboardService.js
const db = require('../config/db');
const { supabaseAdmin } = require('../config/supabase');
const USE_SUPABASE = process.env.USE_SUPABASE === 'true';

/**
 * Leaderboard Service
 * Handles real-time leaderboard calculations and rankings
 */

/**
 * Format seconds to HH:MM:SS
 */
function formatTime(seconds) {
  if (!seconds || seconds <= 0) return null;
  const hrs = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);
  return `${String(hrs).padStart(2, '0')}:${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

/**
 * Get live leaderboard with rankings
 * Ranking formula: puzzles_solved DESC, total_time ASC, hints_used ASC
 */
async function getLiveLeaderboard() {
  if (USE_SUPABASE) {
    return getLiveLeaderboardSupabase();
  }
  return getLiveLeaderboardMySQL();
}

/**
 * Supabase implementation of live leaderboard
 */
async function getLiveLeaderboardSupabase() {
  try {
    // 1. Fetch all active/completed/waiting teams
    const { data: teams, error: teamsError } = await supabaseAdmin
      .from('teams')
      .select('id, team_name, level, status, progress, hints_used, start_time, end_time')
      .in('status', ['active', 'completed', 'waiting']);

    if (teamsError) {
      console.error('Supabase teams fetch error:', teamsError);
      return [];
    }

    if (!teams || teams.length === 0) return [];

    // 2. Calculate total_time_seconds in JS
    const now = new Date();
    const teamsWithTime = teams.map(t => {
      let total_time_seconds = 0;
      if (t.end_time) {
        total_time_seconds = Math.floor((new Date(t.end_time) - new Date(t.start_time)) / 1000);
      } else if (t.start_time) {
        total_time_seconds = Math.floor((now - new Date(t.start_time)) / 1000);
      }
      return { ...t, total_time_seconds };
    });

    // 3. Fetch ALL team_question_progress (try/catch - table may not exist)
    let allProgress = [];
    try {
      const { data: progressData, error: progressError } = await supabaseAdmin
        .from('team_question_progress')
        .select('team_id, puzzle_id, time_spent_seconds, status');

      if (!progressError && progressData) {
        allProgress = progressData;
      }
    } catch (err) {
      console.log('team_question_progress fetch info:', err.message);
    }

    // 4. Fetch ALL puzzles
    let allPuzzles = [];
    try {
      const { data: puzzlesData, error: puzzlesError } = await supabaseAdmin
        .from('puzzles')
        .select('id, level');

      if (!puzzlesError && puzzlesData) {
        allPuzzles = puzzlesData;
      }
    } catch (err) {
      console.log('puzzles fetch info:', err.message);
    }

    // Build puzzle level lookup
    const puzzleLevelMap = {};
    for (const p of allPuzzles) {
      puzzleLevelMap[p.id] = p.level;
    }

    // 5. Process per-team: filter progress by level, sum times, count completed
    const leaderboardData = teamsWithTime.map(team => {
      const teamProgress = allProgress.filter(p => p.team_id === team.id && p.status === 'completed');

      let level1Time = null;
      let level2Time = null;
      let puzzlesSolved = 0;

      // Level 1
      const level1Progress = teamProgress.filter(p => puzzleLevelMap[p.puzzle_id] === 1);
      if (level1Progress.length > 0) {
        level1Time = level1Progress.reduce((sum, p) => sum + (p.time_spent_seconds || 0), 0);
        puzzlesSolved += level1Progress.length;
      }

      // Level 2
      const level2Progress = teamProgress.filter(p => puzzleLevelMap[p.puzzle_id] === 2);
      if (level2Progress.length > 0) {
        level2Time = level2Progress.reduce((sum, p) => sum + (p.time_spent_seconds || 0), 0);
        puzzlesSolved += level2Progress.length;
      }

      return {
        rank: 0,
        id: team.id,
        teamName: team.team_name,
        level: team.level || 1,
        status: team.status,
        progress: team.progress || 0,
        puzzlesSolved,
        hintsUsed: team.hints_used || 0,
        level1Time: formatTime(level1Time),
        level2Time: formatTime(level2Time),
        totalTime: formatTime(team.total_time_seconds),
        totalTimeSeconds: team.total_time_seconds || 0,
        startTime: team.start_time,
        endTime: team.end_time
      };
    });

    // 6. Sort by level DESC, progress DESC, time ASC, hints ASC
    leaderboardData.sort((a, b) => {
      if (b.level !== a.level) return b.level - a.level;
      if (b.progress !== a.progress) return b.progress - a.progress;
      if (a.totalTimeSeconds !== b.totalTimeSeconds) return a.totalTimeSeconds - b.totalTimeSeconds;
      return a.hintsUsed - b.hintsUsed;
    });

    // 7. Assign ranks
    return leaderboardData.map((team, index) => ({
      ...team,
      rank: index + 1
    }));
  } catch (error) {
    console.error('getLiveLeaderboardSupabase error:', error);
    return [];
  }
}

/**
 * MySQL implementation of live leaderboard (original)
 */
async function getLiveLeaderboardMySQL() {
  try {
    // Get teams with their overall stats
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
        CASE 
          WHEN t.end_time IS NOT NULL THEN TIMESTAMPDIFF(SECOND, t.start_time, t.end_time)
          WHEN t.start_time IS NOT NULL THEN TIMESTAMPDIFF(SECOND, t.start_time, NOW())
          ELSE 0
        END as total_time_seconds
      FROM teams t
      WHERE t.status IN ('active', 'completed', 'waiting')
      ORDER BY 
        t.level DESC,
        t.progress DESC,
        total_time_seconds ASC,
        t.hints_used ASC
    `);

    // Get per-level times for each team
    const leaderboardData = await Promise.all(teams.map(async (team) => {
      let level1Time = null;
      let level2Time = null;
      let puzzlesSolved = 0;
      
      try {
        // Get total time spent on level 1 puzzles (completed ones)
        const [level1Data] = await db.query(`
          SELECT 
            SUM(tqp.time_spent_seconds) as total_time,
            COUNT(*) as completed_count
          FROM team_question_progress tqp
          JOIN puzzles p ON tqp.puzzle_id = p.id
          WHERE tqp.team_id = ? AND p.level = 1 AND tqp.status = 'completed'
        `, [team.id]);
        
        if (level1Data[0]?.total_time) {
          level1Time = level1Data[0].total_time;
          puzzlesSolved += level1Data[0].completed_count || 0;
        }
        
        // Get total time spent on level 2 puzzles (completed ones)
        const [level2Data] = await db.query(`
          SELECT 
            SUM(tqp.time_spent_seconds) as total_time,
            COUNT(*) as completed_count
          FROM team_question_progress tqp
          JOIN puzzles p ON tqp.puzzle_id = p.id
          WHERE tqp.team_id = ? AND p.level = 2 AND tqp.status = 'completed'
        `, [team.id]);
        
        if (level2Data[0]?.total_time) {
          level2Time = level2Data[0].total_time;
          puzzlesSolved += level2Data[0].completed_count || 0;
        }
      } catch (err) {
        // Tables might not exist or have different schema
        console.log('Level time query info:', err.code || err.message);
      }
      
      return {
        rank: 0,
        id: team.id,
        teamName: team.team_name,
        level: team.level || 1,
        status: team.status,
        progress: team.progress || 0,
        puzzlesSolved: puzzlesSolved,
        hintsUsed: team.hints_used || 0,
        level1Time: formatTime(level1Time),
        level2Time: formatTime(level2Time),
        totalTime: formatTime(team.total_time_seconds),
        totalTimeSeconds: team.total_time_seconds || 0,
        startTime: team.start_time,
        endTime: team.end_time
      };
    }));

    // Sort by performance: puzzlesSolved DESC, totalTimeSeconds ASC, hintsUsed ASC
    leaderboardData.sort((a, b) => {
      if (b.puzzlesSolved !== a.puzzlesSolved) return b.puzzlesSolved - a.puzzlesSolved;
      if (a.totalTimeSeconds !== b.totalTimeSeconds) return a.totalTimeSeconds - b.totalTimeSeconds;
      return a.hintsUsed - b.hintsUsed;
    });

    // Add rankings
    return leaderboardData.map((team, index) => ({
      ...team,
      rank: index + 1
    }));
  } catch (error) {
    console.error('getLiveLeaderboard error:', error);
    return [];
  }
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
