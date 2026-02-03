const { getPool } = require('./_lib/db');
const { setCorsHeaders } = require('./_lib/auth');

/**
 * Leaderboard API - Serverless Handler
 * Handles: /api/leaderboard
 */

module.exports = async function handler(req, res) {
  setCorsHeaders(res);
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const db = getPool();

  try {
    const [teams] = await db.query(`
      SELECT 
        t.id,
        t.team_name,
        t.total_score,
        t.current_level,
        t.puzzles_solved,
        t.status,
        u.name as leader_name
      FROM teams t
      JOIN users u ON t.user_id = u.id
      WHERE t.status != 'disqualified'
      ORDER BY t.total_score DESC, t.puzzles_solved DESC
      LIMIT 100
    `);

    return res.json(teams);

  } catch (error) {
    console.error('Leaderboard API error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
};
