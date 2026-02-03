const { getPool } = require('../_lib/db');
const { verifyAuth, requireAdmin, setCorsHeaders } = require('../_lib/auth');

/**
 * Puzzles API - Serverless Handler
 * Handles: /api/puzzles/*
 */

module.exports = async function handler(req, res) {
  setCorsHeaders(res);
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const db = getPool();
  const path = req.url.replace('/api/puzzles', '').split('?')[0];
  const url = new URL(req.url, `http://${req.headers.host}`);

  try {
    // GET /api/puzzles - List all puzzles (admin)
    if (req.method === 'GET' && (path === '' || path === '/')) {
      const authResult = verifyAuth(req);
      if (authResult.error) {
        return res.status(authResult.status).json({ error: authResult.error });
      }

      const adminCheck = requireAdmin(authResult.user);
      if (adminCheck) {
        return res.status(adminCheck.status).json({ error: adminCheck.error });
      }

      const level = url.searchParams.get('level');
      let query = 'SELECT * FROM puzzles';
      let params = [];

      if (level) {
        query += ' WHERE level = ?';
        params.push(level);
      }

      query += ' ORDER BY level, sequence';

      const [puzzles] = await db.query(query, params);
      return res.json(puzzles);
    }

    // GET /api/puzzles/:id
    if (req.method === 'GET' && path.match(/^\/[^\/]+$/)) {
      const puzzleId = path.slice(1);
      const [puzzles] = await db.query('SELECT * FROM puzzles WHERE id = ?', [puzzleId]);

      if (puzzles.length === 0) {
        return res.status(404).json({ error: 'Puzzle not found' });
      }

      return res.json(puzzles[0]);
    }

    // Protected admin routes
    const authResult = verifyAuth(req);
    if (authResult.error) {
      return res.status(authResult.status).json({ error: authResult.error });
    }

    const adminCheck = requireAdmin(authResult.user);
    if (adminCheck) {
      return res.status(adminCheck.status).json({ error: adminCheck.error });
    }

    // POST /api/puzzles - Create puzzle
    if (req.method === 'POST' && (path === '' || path === '/')) {
      const { title, description, type, level, points, answer, hint1, hint2, sequence } = req.body;

      const [result] = await db.query(
        `INSERT INTO puzzles (id, title, description, type, level, points, answer, hint1, hint2, sequence)
         VALUES (UUID(), ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [title, description, type || 'text', level, points || 100, answer, hint1 || null, hint2 || null, sequence || 1]
      );

      return res.status(201).json({ message: 'Puzzle created', id: result.insertId });
    }

    // PUT /api/puzzles/:id - Update puzzle
    if (req.method === 'PUT' && path.match(/^\/[^\/]+$/)) {
      const puzzleId = path.slice(1);
      const { title, description, type, level, points, answer, hint1, hint2, sequence } = req.body;

      await db.query(
        `UPDATE puzzles SET title = ?, description = ?, type = ?, level = ?, points = ?, 
         answer = ?, hint1 = ?, hint2 = ?, sequence = ? WHERE id = ?`,
        [title, description, type, level, points, answer, hint1, hint2, sequence, puzzleId]
      );

      return res.json({ message: 'Puzzle updated' });
    }

    // DELETE /api/puzzles/:id
    if (req.method === 'DELETE' && path.match(/^\/[^\/]+$/)) {
      const puzzleId = path.slice(1);
      await db.query('DELETE FROM puzzles WHERE id = ?', [puzzleId]);
      return res.json({ message: 'Puzzle deleted' });
    }

    return res.status(404).json({ error: 'Endpoint not found' });

  } catch (error) {
    console.error('Puzzles API error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
};
