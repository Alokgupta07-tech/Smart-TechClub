/**
 * SAMPLE BACKEND SERVER FOR LOCKDOWN HQ
 * 
 * This is a minimal Express + MySQL backend server.
 * Copy this to a separate folder and run:
 * 
 * npm init -y
 * npm install express mysql2 cors dotenv
 * node server.js
 */

const express = require('express');
const mysql = require('mysql2/promise');
const cors = require('cors');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// ============================================
// MIDDLEWARE
// ============================================
app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:8080',
  credentials: true
}));
app.use(express.json());

// ============================================
// DATABASE CONNECTION POOL
// ============================================
const pool = mysql.createPool({
  host: process.env.DB_HOST || 'localhost',
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME || 'lockdown_hq',
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0
});

// ============================================
// ADMIN ENDPOINTS
// ============================================

/**
 * GET /api/admin/teams
 * Returns all teams with calculated time elapsed
 */
app.get('/api/admin/teams', async (req, res) => {
  try {
    const [rows] = await pool.query(`
      SELECT 
        id,
        team_name AS teamName,
        level,
        status,
        progress,
        start_time AS startTime,
        end_time AS endTime,
        hints_used AS hintsUsed,
        CASE 
          WHEN start_time IS NOT NULL AND end_time IS NULL THEN
            SEC_TO_TIME(TIMESTAMPDIFF(SECOND, start_time, NOW()))
          WHEN start_time IS NOT NULL AND end_time IS NOT NULL THEN
            SEC_TO_TIME(TIMESTAMPDIFF(SECOND, start_time, end_time))
          ELSE '00:00:00'
        END AS timeElapsed,
        created_at AS createdAt
      FROM teams
      ORDER BY created_at DESC
    `);
    
    res.json(rows);
  } catch (error) {
    console.error('Error fetching teams:', error);
    res.status(500).json({ error: 'Failed to fetch teams' });
  }
});

/**
 * GET /api/admin/stats
 * Returns aggregated statistics from database
 */
app.get('/api/admin/stats', async (req, res) => {
  try {
    const [rows] = await pool.query(`
      SELECT
        COUNT(*) AS totalTeams,
        SUM(CASE WHEN status = 'active' THEN 1 ELSE 0 END) AS active,
        SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) AS completed,
        SUM(CASE WHEN status = 'waiting' THEN 1 ELSE 0 END) AS waiting,
        COALESCE(
          SEC_TO_TIME(
            AVG(
              CASE 
                WHEN start_time IS NOT NULL AND end_time IS NOT NULL 
                THEN TIMESTAMPDIFF(SECOND, start_time, end_time)
                ELSE NULL
              END
            )
          ),
          '00:00:00'
        ) AS avgTime,
        SUM(hints_used) AS hintsUsed
      FROM teams
    `);
    
    res.json(rows[0]);
  } catch (error) {
    console.error('Error fetching stats:', error);
    res.status(500).json({ error: 'Failed to fetch stats' });
  }
});

/**
 * GET /api/admin/alerts
 * Returns recent activity logs
 */
app.get('/api/admin/alerts', async (req, res) => {
  try {
    const [rows] = await pool.query(`
      SELECT 
        a.id, 
        a.team_id AS teamId, 
        t.team_name AS team, 
        a.type, 
        a.message, 
        a.severity AS type,
        a.created_at AS createdAt
      FROM activity_logs a
      INNER JOIN teams t ON a.team_id = t.id
      ORDER BY a.created_at DESC
      LIMIT 50
    `);
    
    res.json(rows);
  } catch (error) {
    console.error('Error fetching alerts:', error);
    res.status(500).json({ error: 'Failed to fetch alerts' });
  }
});

/**
 * PATCH /api/admin/team/:id/action
 * Perform action on a team (pause, resume, disqualify, reset)
 */
app.patch('/api/admin/team/:id/action', async (req, res) => {
  try {
    const { id } = req.params;
    const { action } = req.body;
    
    let updateQuery = '';
    let params = [id];
    
    switch (action) {
      case 'pause':
        updateQuery = 'UPDATE teams SET status = "waiting" WHERE id = ?';
        break;
      case 'resume':
        updateQuery = 'UPDATE teams SET status = "active" WHERE id = ?';
        break;
      case 'disqualify':
        updateQuery = 'UPDATE teams SET status = "disqualified" WHERE id = ?';
        break;
      case 'reset':
        updateQuery = 'UPDATE teams SET progress = 0, level = 1, start_time = NULL, end_time = NULL, status = "waiting", hints_used = 0 WHERE id = ?';
        break;
      default:
        return res.status(400).json({ error: 'Invalid action' });
    }
    
    await pool.query(updateQuery, params);
    
    // Log the action
    await pool.query(`
      INSERT INTO activity_logs (team_id, type, message, severity)
      VALUES (?, 'system', ?, 'info')
    `, [id, `Team ${action} by admin`]);
    
    res.json({ success: true, message: `Team ${action} successful` });
  } catch (error) {
    console.error('Error performing team action:', error);
    res.status(500).json({ error: 'Failed to perform action' });
  }
});

// ============================================
// PUBLIC ENDPOINTS
// ============================================

/**
 * GET /api/leaderboard
 * Returns ranked teams (public endpoint)
 */
app.get('/api/leaderboard', async (req, res) => {
  try {
    const [rows] = await pool.query(`
      SELECT 
        t.id,
        t.team_name AS teamName,
        t.level,
        t.status,
        t.progress,
        t.hints_used AS hintsUsed,
        CASE 
          WHEN t.start_time IS NOT NULL AND t.end_time IS NOT NULL THEN
            SEC_TO_TIME(TIMESTAMPDIFF(SECOND, t.start_time, t.end_time))
          ELSE NULL
        END AS totalTime,
        NULL AS level1Time,
        NULL AS level2Time,
        t.created_at AS createdAt
      FROM teams t
      WHERE t.status IN ('active', 'completed')
      ORDER BY 
        CASE WHEN t.status = 'completed' THEN 0 ELSE 1 END,
        TIMESTAMPDIFF(SECOND, t.start_time, COALESCE(t.end_time, NOW())) ASC,
        t.hints_used ASC,
        t.created_at ASC
    `);
    
    // Add rank to each team
    const leaderboard = rows.map((team, index) => ({
      ...team,
      rank: index + 1,
      change: undefined // Can be calculated by comparing with previous rankings
    }));
    
    res.json(leaderboard);
  } catch (error) {
    console.error('Error fetching leaderboard:', error);
    res.status(500).json({ error: 'Failed to fetch leaderboard' });
  }
});

// ============================================
// HEALTH CHECK
// ============================================
app.get('/api/health', async (req, res) => {
  try {
    await pool.query('SELECT 1');
    res.json({ status: 'ok', database: 'connected' });
  } catch (error) {
    res.status(500).json({ status: 'error', database: 'disconnected' });
  }
});

// ============================================
// ERROR HANDLING
// ============================================
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  res.status(500).json({ error: 'Internal server error' });
});

// ============================================
// START SERVER
// ============================================
app.listen(PORT, () => {
  console.log(`
╔════════════════════════════════════════╗
║   LOCKDOWN HQ Backend Server          ║
║   Running on: http://localhost:${PORT}   ║
║   Database: ${process.env.DB_NAME || 'lockdown_hq'}              ║
╚════════════════════════════════════════╝

Available endpoints:
  GET  /api/admin/teams
  GET  /api/admin/stats
  GET  /api/admin/alerts
  PATCH /api/admin/team/:id/action
  GET  /api/leaderboard
  GET  /api/health
  `);
});

// ============================================
// GRACEFUL SHUTDOWN
// ============================================
process.on('SIGTERM', async () => {
  console.log('SIGTERM signal received: closing HTTP server');
  await pool.end();
  process.exit(0);
});
