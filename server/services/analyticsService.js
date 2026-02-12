// server/services/analyticsService.js
const db = require('../config/db');
const { supabaseAdmin } = require('../config/supabase');
const { v4: uuidv4 } = require('uuid');

const USE_SUPABASE = process.env.USE_SUPABASE === 'true';

/**
 * Analytics Service
 * Puzzle analytics and suspicious activity detection
 */

/**
 * Get puzzle analytics
 */
async function getPuzzleAnalytics(puzzleId) {
  if (USE_SUPABASE) {
    try {
      // Get all submissions for this puzzle
      const { data: submissions, error: subErr } = await supabaseAdmin
        .from('submissions')
        .select('is_correct, time_taken_seconds, team_id')
        .eq('puzzle_id', puzzleId);
      if (subErr) throw subErr;

      const allSubs = submissions || [];
      const totalAttempts = allSubs.length;
      const successfulAttempts = allSubs.filter(s => s.is_correct).length;
      const correctSubs = allSubs.filter(s => s.is_correct && s.time_taken_seconds != null);
      const avgSolveTime = correctSubs.length > 0
        ? Math.round(correctSubs.reduce((sum, s) => sum + s.time_taken_seconds, 0) / correctSubs.length)
        : 0;
      const minSolveTime = correctSubs.length > 0
        ? Math.min(...correctSubs.map(s => s.time_taken_seconds))
        : 0;
      const maxSolveTime = correctSubs.length > 0
        ? Math.max(...correctSubs.map(s => s.time_taken_seconds))
        : 0;

      // Hint usage stats - distinct teams
      const { data: hintData, error: hintErr } = await supabaseAdmin
        .from('hint_usage')
        .select('team_id')
        .eq('puzzle_id', puzzleId);
      if (hintErr) throw hintErr;

      const teamsUsedHints = new Set((hintData || []).map(r => r.team_id)).size;

      // Distinct teams that attempted
      const teamsAttempted = new Set(allSubs.map(s => s.team_id)).size;

      const failureRate = totalAttempts > 0
        ? parseFloat(((totalAttempts - successfulAttempts) / totalAttempts * 100).toFixed(2))
        : 0;
      const hintUsageRate = teamsAttempted > 0
        ? parseFloat((teamsUsedHints / teamsAttempted * 100).toFixed(2))
        : 0;

      return {
        puzzleId,
        totalAttempts,
        successfulAttempts,
        avgSolveTimeSeconds: avgSolveTime,
        minSolveTimeSeconds: minSolveTime,
        maxSolveTimeSeconds: maxSolveTime,
        failureRate,
        hintUsageRate,
        teamsAttempted,
        teamsUsedHints
      };
    } catch (err) {
      console.error('Supabase getPuzzleAnalytics error, falling back to MySQL:', err.message);
      return getPuzzleAnalyticsMysql(puzzleId);
    }
  } else {
    return getPuzzleAnalyticsMysql(puzzleId);
  }
}

/** MySQL fallback for getPuzzleAnalytics */
async function getPuzzleAnalyticsMysql(puzzleId) {
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

  const [[hintStats]] = await db.query(`
    SELECT COUNT(DISTINCT team_id) as teams_used_hints
    FROM hint_usage
    WHERE puzzle_id = ?
  `, [puzzleId]);

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

  if (USE_SUPABASE) {
    try {
      // Check if record exists
      const { data: existing, error: selErr } = await supabaseAdmin
        .from('puzzle_analytics')
        .select('id')
        .eq('puzzle_id', puzzleId)
        .maybeSingle();
      if (selErr) throw selErr;

      if (existing) {
        // Update existing
        const { error: updErr } = await supabaseAdmin
          .from('puzzle_analytics')
          .update({
            total_attempts: analytics.totalAttempts,
            successful_attempts: analytics.successfulAttempts,
            avg_solve_time_seconds: analytics.avgSolveTimeSeconds,
            min_solve_time_seconds: analytics.minSolveTimeSeconds,
            max_solve_time_seconds: analytics.maxSolveTimeSeconds,
            failure_rate: analytics.failureRate,
            hint_usage_rate: analytics.hintUsageRate
          })
          .eq('id', existing.id);
        if (updErr) throw updErr;
      } else {
        // Insert new
        const { error: insErr } = await supabaseAdmin
          .from('puzzle_analytics')
          .insert({
            id: uuidv4(),
            puzzle_id: puzzleId,
            total_attempts: analytics.totalAttempts,
            successful_attempts: analytics.successfulAttempts,
            avg_solve_time_seconds: analytics.avgSolveTimeSeconds,
            min_solve_time_seconds: analytics.minSolveTimeSeconds,
            max_solve_time_seconds: analytics.maxSolveTimeSeconds,
            failure_rate: analytics.failureRate,
            hint_usage_rate: analytics.hintUsageRate
          });
        if (insErr) throw insErr;
      }

      return analytics;
    } catch (err) {
      console.error('Supabase updatePuzzleAnalytics error, falling back to MySQL:', err.message);
      return updatePuzzleAnalyticsMysql(puzzleId, analytics);
    }
  } else {
    return updatePuzzleAnalyticsMysql(puzzleId, analytics);
  }
}

/** MySQL fallback for updatePuzzleAnalytics */
async function updatePuzzleAnalyticsMysql(puzzleId, analytics) {
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

  if (USE_SUPABASE) {
    try {
      // Check for rapid submissions (>10 per minute)
      if (eventType === 'submission') {
        const oneMinuteAgo = new Date(Date.now() - 60 * 1000).toISOString();

        const { data: recentSubs, error: subErr } = await supabaseAdmin
          .from('submissions')
          .select('id')
          .eq('team_id', teamId)
          .gte('submitted_at', oneMinuteAgo);
        if (subErr) throw subErr;

        const count = (recentSubs || []).length;
        if (count > 10) {
          alerts.push({
            type: 'rapid_submission',
            severity: 'high',
            description: `${count} submissions in the last minute`,
            metadata: { count }
          });
        }
      }

      // Check for suspiciously fast solve
      if (eventType === 'puzzle_solve' && eventData.solveTimeSeconds) {
        const { data: correctSubs, error: avgErr } = await supabaseAdmin
          .from('submissions')
          .select('time_taken_seconds')
          .eq('puzzle_id', eventData.puzzleId)
          .eq('is_correct', true);
        if (avgErr) throw avgErr;

        const times = (correctSubs || []).map(s => s.time_taken_seconds).filter(t => t != null);
        const avgSolveTime = times.length > 0
          ? times.reduce((sum, t) => sum + t, 0) / times.length
          : 300;
        const threshold = avgSolveTime * 0.2;

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
        const { error: alertInsErr } = await supabaseAdmin
          .from('suspicious_alerts')
          .insert({
            id: uuidv4(),
            team_id: teamId,
            alert_type: alert.type,
            severity: alert.severity,
            description: alert.description,
            metadata: alert.metadata
          });
        if (alertInsErr) console.error('Failed to insert suspicious_alert:', alertInsErr.message);

        const { error: logInsErr } = await supabaseAdmin
          .from('activity_logs')
          .insert({
            id: uuidv4(),
            team_id: teamId,
            action_type: 'suspicious_activity',
            description: alert.description,
            metadata: alert
          });
        if (logInsErr) console.error('Failed to insert activity_log:', logInsErr.message);
      }

      return alerts;
    } catch (err) {
      console.error('Supabase detectSuspiciousActivity error, falling back to MySQL:', err.message);
      return detectSuspiciousActivityMysql(teamId, eventType, eventData);
    }
  } else {
    return detectSuspiciousActivityMysql(teamId, eventType, eventData);
  }
}

/** MySQL fallback for detectSuspiciousActivity */
async function detectSuspiciousActivityMysql(teamId, eventType, eventData = {}) {
  const alerts = [];

  try {
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

    if (eventType === 'puzzle_solve' && eventData.solveTimeSeconds) {
      const [[avgTime]] = await db.query(`
        SELECT AVG(time_taken_seconds) as avg_time
        FROM submissions
        WHERE puzzle_id = ? AND is_correct = true
      `, [eventData.puzzleId]);

      const avgSolveTime = avgTime.avg_time || 300;
      const threshold = avgSolveTime * 0.2;

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

    for (const alert of alerts) {
      await db.query(`
        INSERT INTO suspicious_alerts (id, team_id, alert_type, severity, description, metadata)
        VALUES (UUID(), ?, ?, ?, ?, ?)
      `, [teamId, alert.type, alert.severity, alert.description, JSON.stringify(alert.metadata)]);

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
  if (USE_SUPABASE) {
    try {
      let query = supabaseAdmin
        .from('suspicious_alerts')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(limit);

      if (unreviewedOnly) {
        query = query.eq('is_reviewed', false);
      }

      const { data: alertsData, error: alertErr } = await query;
      if (alertErr) throw alertErr;

      const alerts = alertsData || [];
      if (alerts.length === 0) return alerts;

      // Get team names separately
      const teamIds = [...new Set(alerts.map(a => a.team_id))];
      const { data: teamsData, error: teamErr } = await supabaseAdmin
        .from('teams')
        .select('id, team_name')
        .in('id', teamIds);
      if (teamErr) throw teamErr;

      const teamMap = {};
      for (const t of (teamsData || [])) {
        teamMap[t.id] = t.team_name;
      }

      return alerts.map(a => ({
        ...a,
        team_name: teamMap[a.team_id] || null
      }));
    } catch (err) {
      console.error('Supabase getSuspiciousAlerts error, falling back to MySQL:', err.message);
      return getSuspiciousAlertsMysql(limit, unreviewedOnly);
    }
  } else {
    return getSuspiciousAlertsMysql(limit, unreviewedOnly);
  }
}

/** MySQL fallback for getSuspiciousAlerts */
async function getSuspiciousAlertsMysql(limit = 50, unreviewedOnly = false) {
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
  if (USE_SUPABASE) {
    try {
      const { error } = await supabaseAdmin
        .from('suspicious_alerts')
        .update({
          is_reviewed: true,
          reviewed_by: reviewerId,
          reviewed_at: new Date().toISOString()
        })
        .eq('id', alertId);
      if (error) throw error;
    } catch (err) {
      console.error('Supabase reviewAlert error, falling back to MySQL:', err.message);
      await reviewAlertMysql(alertId, reviewerId);
    }
  } else {
    await reviewAlertMysql(alertId, reviewerId);
  }
}

/** MySQL fallback for reviewAlert */
async function reviewAlertMysql(alertId, reviewerId) {
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
