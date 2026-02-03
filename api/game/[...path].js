const { getPool } = require('../_lib/db');
const { verifyAuth, requireAdmin, setCorsHeaders } = require('../_lib/auth');

/**
 * Game API - Serverless Handler
 * Handles: /api/game/*
 */

module.exports = async function handler(req, res) {
  setCorsHeaders(res);
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const db = getPool();
  const path = req.url.replace('/api/game', '').split('?')[0];

  try {
    // GET /api/game/state - Public
    if (req.method === 'GET' && path === '/state') {
      const [states] = await db.query('SELECT * FROM game_state LIMIT 1');

      if (states.length === 0) {
        // Create default game state
        await db.query(`
          INSERT INTO game_state (id, phase, current_level, max_level, start_time, end_time)
          VALUES (1, 'waiting', 1, 5, NULL, NULL)
        `);
        return res.json({
          id: 1,
          phase: 'waiting',
          current_level: 1,
          max_level: 5,
          start_time: null,
          end_time: null
        });
      }

      return res.json(states[0]);
    }

    // Protected routes below
    const authResult = verifyAuth(req);
    if (authResult.error) {
      return res.status(authResult.status).json({ error: authResult.error, code: authResult.code });
    }

    const adminCheck = requireAdmin(authResult.user);
    if (adminCheck) {
      return res.status(adminCheck.status).json({ error: adminCheck.error });
    }

    // POST /api/game/start
    if (req.method === 'POST' && path === '/start') {
      await db.query(`
        UPDATE game_state SET phase = 'active', start_time = NOW() WHERE id = 1
      `);
      return res.json({ message: 'Game started' });
    }

    // POST /api/game/pause
    if (req.method === 'POST' && path === '/pause') {
      await db.query(`UPDATE game_state SET phase = 'paused' WHERE id = 1`);
      return res.json({ message: 'Game paused' });
    }

    // POST /api/game/resume
    if (req.method === 'POST' && path === '/resume') {
      await db.query(`UPDATE game_state SET phase = 'active' WHERE id = 1`);
      return res.json({ message: 'Game resumed' });
    }

    // POST /api/game/end
    if (req.method === 'POST' && path === '/end') {
      await db.query(`UPDATE game_state SET phase = 'ended', end_time = NOW() WHERE id = 1`);
      return res.json({ message: 'Game ended' });
    }

    // POST /api/game/reset
    if (req.method === 'POST' && path === '/reset') {
      await db.query(`
        UPDATE game_state SET phase = 'waiting', current_level = 1, start_time = NULL, end_time = NULL WHERE id = 1
      `);
      await db.query(`UPDATE teams SET current_level = 1, total_score = 0, status = 'waiting'`);
      return res.json({ message: 'Game reset' });
    }

    // POST /api/game/level/unlock
    if (req.method === 'POST' && path === '/level/unlock') {
      const { level } = req.body;
      await db.query(`UPDATE game_state SET current_level = ? WHERE id = 1`, [level]);
      return res.json({ message: `Level ${level} unlocked` });
    }

    // POST /api/game/broadcast
    if (req.method === 'POST' && path === '/broadcast') {
      const { message, type } = req.body;
      await db.query(
        'INSERT INTO broadcasts (id, message, type, created_at) VALUES (UUID(), ?, ?, NOW())',
        [message, type || 'info']
      );
      return res.json({ message: 'Broadcast sent' });
    }

    return res.status(404).json({ error: 'Endpoint not found' });

  } catch (error) {
    console.error('Game API error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
};
