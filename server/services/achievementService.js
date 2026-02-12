// server/services/achievementService.js
const db = require('../config/db');
const { supabaseAdmin } = require('../config/supabase');
const { v4: uuidv4 } = require('uuid');

const USE_SUPABASE = process.env.USE_SUPABASE === 'true';

/**
 * Achievement Service
 * Handles automatic achievement detection and awarding
 */

/**
 * Check and award achievements based on event
 */
async function checkAndAwardAchievements(teamId, eventType, eventData = {}) {
  try {
    let achievements;

    if (USE_SUPABASE) {
      try {
        const { data, error } = await supabaseAdmin
          .from('achievements')
          .select('*')
          .eq('is_active', true)
          .eq('trigger_type', 'auto');
        if (error) throw error;
        achievements = data || [];
      } catch (err) {
        console.error('Supabase checkAndAwardAchievements error, falling back to MySQL:', err.message);
        const [rows] = await db.query(
          'SELECT * FROM achievements WHERE is_active = true AND trigger_type = ?',
          ['auto']
        );
        achievements = rows;
      }
    } else {
      const [rows] = await db.query(
        'SELECT * FROM achievements WHERE is_active = true AND trigger_type = ?',
        ['auto']
      );
      achievements = rows;
    }

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

  if (USE_SUPABASE) {
    try {
      switch (type) {
        case 'first_solve': {
          if (eventType !== 'puzzle_solve') return false;
          const { data, error } = await supabaseAdmin
            .from('team_progress')
            .select('id')
            .eq('puzzle_id', eventData.puzzleId)
            .eq('is_completed', true);
          if (error) throw error;
          return (data || []).length === 1;
        }

        case 'solve_time':
          if (eventType !== 'puzzle_solve') return false;
          return eventData.solveTimeSeconds && eventData.solveTimeSeconds <= condition.max_seconds;

        case 'no_hints_level': {
          if (eventType !== 'level_complete') return false;
          // Get puzzles for the level
          const { data: puzzles, error: pErr } = await supabaseAdmin
            .from('puzzles')
            .select('id')
            .eq('level', eventData.level);
          if (pErr) throw pErr;
          const puzzleIds = (puzzles || []).map(p => p.id);
          if (puzzleIds.length === 0) return true;

          // Check hint usage for those puzzles
          const { data: hints, error: hErr } = await supabaseAdmin
            .from('hint_usage')
            .select('id')
            .eq('team_id', teamId)
            .in('puzzle_id', puzzleIds);
          if (hErr) throw hErr;
          return (hints || []).length === 0;
        }

        case 'level_complete':
          if (eventType !== 'level_complete') return false;
          return eventData.level === condition.level;

        case 'perfect_accuracy': {
          if (eventType !== 'game_complete') return false;
          const { data: subs, error: sErr } = await supabaseAdmin
            .from('submissions')
            .select('is_correct')
            .eq('team_id', teamId);
          if (sErr) throw sErr;
          const allSubs = subs || [];
          const total = allSubs.length;
          const correct = allSubs.filter(s => s.is_correct).length;
          return total > 0 && total === correct;
        }

        case 'total_time':
          if (eventType !== 'game_complete') return false;
          return eventData.totalTimeSeconds && eventData.totalTimeSeconds <= condition.max_seconds;

        case 'first_start': {
          if (eventType !== 'game_start') return false;
          const { data: activeTeams, error: tErr } = await supabaseAdmin
            .from('teams')
            .select('id')
            .eq('status', 'active');
          if (tErr) throw tErr;
          return (activeTeams || []).length === 1;
        }

        default:
          return false;
      }
    } catch (err) {
      console.error('Supabase evaluateCondition error, falling back to MySQL:', err.message);
      return evaluateConditionMysql(teamId, condition, eventType, eventData);
    }
  } else {
    return evaluateConditionMysql(teamId, condition, eventType, eventData);
  }
}

/** MySQL fallback for evaluateCondition */
async function evaluateConditionMysql(teamId, condition, eventType, eventData) {
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
  if (USE_SUPABASE) {
    try {
      // Check if already awarded
      const { data: existing, error: selErr } = await supabaseAdmin
        .from('team_achievements')
        .select('id')
        .eq('team_id', teamId)
        .eq('achievement_id', achievementId);
      if (selErr) throw selErr;
      if ((existing || []).length > 0) return false;

      // Insert team_achievement
      const { error: insErr } = await supabaseAdmin
        .from('team_achievements')
        .insert({
          id: uuidv4(),
          team_id: teamId,
          achievement_id: achievementId,
          awarded_by: awardedBy
        });
      if (insErr) throw insErr;

      // Get achievement details for notification
      const { data: achData, error: achErr } = await supabaseAdmin
        .from('achievements')
        .select('name, description')
        .eq('id', achievementId)
        .maybeSingle();
      if (achErr) throw achErr;

      if (achData) {
        const { error: notifErr } = await supabaseAdmin
          .from('notifications')
          .insert({
            id: uuidv4(),
            team_id: teamId,
            notification_type: 'achievement',
            title: `Achievement Unlocked: ${achData.name}`,
            message: achData.description,
            priority: 'high'
          });
        if (notifErr) console.error('Failed to insert notification:', notifErr.message);
      }

      return true;
    } catch (err) {
      console.error('Supabase awardAchievement error, falling back to MySQL:', err.message);
      return awardAchievementMysql(teamId, achievementId, awardedBy);
    }
  } else {
    return awardAchievementMysql(teamId, achievementId, awardedBy);
  }
}

/** MySQL fallback for awardAchievement */
async function awardAchievementMysql(teamId, achievementId, awardedBy = null) {
  try {
    const [existing] = await db.query(
      'SELECT id FROM team_achievements WHERE team_id = ? AND achievement_id = ?',
      [teamId, achievementId]
    );

    if (existing.length > 0) return false;

    await db.query(
      'INSERT INTO team_achievements (id, team_id, achievement_id, awarded_by) VALUES (UUID(), ?, ?, ?)',
      [teamId, achievementId, awardedBy]
    );

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
  if (USE_SUPABASE) {
    try {
      // Get team_achievements for this team
      const { data: taData, error: taErr } = await supabaseAdmin
        .from('team_achievements')
        .select('achievement_id, awarded_at, metadata')
        .eq('team_id', teamId)
        .order('awarded_at', { ascending: false });
      if (taErr) throw taErr;

      const teamAchs = taData || [];
      if (teamAchs.length === 0) return [];

      // Get achievement details
      const achIds = teamAchs.map(ta => ta.achievement_id);
      const { data: achData, error: achErr } = await supabaseAdmin
        .from('achievements')
        .select('*')
        .in('id', achIds);
      if (achErr) throw achErr;

      const achMap = {};
      for (const a of (achData || [])) {
        achMap[a.id] = a;
      }

      // Merge
      return teamAchs.map(ta => ({
        ...(achMap[ta.achievement_id] || {}),
        awarded_at: ta.awarded_at,
        metadata: ta.metadata
      }));
    } catch (err) {
      console.error('Supabase getTeamAchievements error, falling back to MySQL:', err.message);
      return getTeamAchievementsMysql(teamId);
    }
  } else {
    return getTeamAchievementsMysql(teamId);
  }
}

/** MySQL fallback for getTeamAchievements */
async function getTeamAchievementsMysql(teamId) {
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
  if (USE_SUPABASE) {
    try {
      // Get all active achievements
      const { data: allAchs, error: achErr } = await supabaseAdmin
        .from('achievements')
        .select('*')
        .eq('is_active', true);
      if (achErr) throw achErr;

      // Get team_achievements for this team
      const { data: taData, error: taErr } = await supabaseAdmin
        .from('team_achievements')
        .select('achievement_id, id, awarded_at')
        .eq('team_id', teamId);
      if (taErr) throw taErr;

      const earnedMap = {};
      for (const ta of (taData || [])) {
        earnedMap[ta.achievement_id] = ta;
      }

      // Merge - mark earned=true/false
      const result = (allAchs || []).map(a => ({
        ...a,
        earned: !!earnedMap[a.id],
        awarded_at: earnedMap[a.id]?.awarded_at || null
      }));

      // Sort: earned first, then by points desc
      result.sort((a, b) => {
        if (a.earned !== b.earned) return a.earned ? -1 : 1;
        return (b.points || 0) - (a.points || 0);
      });

      return result;
    } catch (err) {
      console.error('Supabase getAllAchievementsWithProgress error, falling back to MySQL:', err.message);
      return getAllAchievementsWithProgressMysql(teamId);
    }
  } else {
    return getAllAchievementsWithProgressMysql(teamId);
  }
}

/** MySQL fallback for getAllAchievementsWithProgress */
async function getAllAchievementsWithProgressMysql(teamId) {
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
