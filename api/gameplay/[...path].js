const { getPool } = require('../_lib/db');
const { verifyAuth, requireTeam, setCorsHeaders } = require('../_lib/auth');

/**
 * Gameplay API - Serverless Handler
 * Handles: /api/gameplay/*
 */

module.exports = async function handler(req, res) {
  setCorsHeaders(res);
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // Verify authentication
  const authResult = verifyAuth(req);
  if (authResult.error) {
    return res.status(authResult.status).json({ error: authResult.error, code: authResult.code });
  }

  const db = getPool();
  const path = req.url.replace('/api/gameplay', '').split('?')[0];
  const user = authResult.user;

  try {
    // GET /api/gameplay/current - Get current puzzle for team
    if (req.method === 'GET' && path === '/current') {
      const [teams] = await db.query('SELECT * FROM teams WHERE user_id = ?', [user.userId]);

      if (teams.length === 0) {
        return res.status(404).json({ error: 'Team not found' });
      }

      const team = teams[0];

      const [puzzles] = await db.query(
        'SELECT id, title, description, type, level, points FROM puzzles WHERE level = ? ORDER BY sequence LIMIT 1',
        [team.current_level]
      );

      if (puzzles.length === 0) {
        return res.json({ message: 'No puzzles available for this level', puzzle: null });
      }

      return res.json({ puzzle: puzzles[0], team });
    }

    // POST /api/gameplay/puzzle/submit - Submit answer
    if (req.method === 'POST' && path === '/puzzle/submit') {
      const { puzzleId, answer } = req.body;

      const [teams] = await db.query('SELECT * FROM teams WHERE user_id = ?', [user.userId]);
      if (teams.length === 0) {
        return res.status(404).json({ error: 'Team not found' });
      }

      const team = teams[0];

      const [puzzles] = await db.query('SELECT * FROM puzzles WHERE id = ?', [puzzleId]);
      if (puzzles.length === 0) {
        return res.status(404).json({ error: 'Puzzle not found' });
      }

      const puzzle = puzzles[0];

      // Check answer (case-insensitive)
      const isCorrect = puzzle.answer.toLowerCase().trim() === answer.toLowerCase().trim();

      if (isCorrect) {
        // Update team progress
        await db.query(
          'UPDATE teams SET total_score = total_score + ?, puzzles_solved = puzzles_solved + 1 WHERE id = ?',
          [puzzle.points, team.id]
        );

        // Record submission
        await db.query(
          'INSERT INTO submissions (id, team_id, puzzle_id, answer, is_correct, points_earned) VALUES (UUID(), ?, ?, ?, ?, ?)',
          [team.id, puzzleId, answer, true, puzzle.points]
        );

        return res.json({
          correct: true,
          message: 'Correct answer!',
          pointsEarned: puzzle.points
        });
      } else {
        // Record wrong submission
        await db.query(
          'INSERT INTO submissions (id, team_id, puzzle_id, answer, is_correct, points_earned) VALUES (UUID(), ?, ?, ?, ?, ?)',
          [team.id, puzzleId, answer, false, 0]
        );

        return res.json({
          correct: false,
          message: 'Incorrect answer. Try again!'
        });
      }
    }

    // POST /api/gameplay/puzzle/hint - Request hint
    if (req.method === 'POST' && path === '/puzzle/hint') {
      const { puzzleId, hintNumber } = req.body;

      const [teams] = await db.query('SELECT * FROM teams WHERE user_id = ?', [user.userId]);
      if (teams.length === 0) {
        return res.status(404).json({ error: 'Team not found' });
      }

      const team = teams[0];

      if (team.hints_used >= 3) {
        return res.status(400).json({ error: 'No hints remaining' });
      }

      const [puzzles] = await db.query('SELECT * FROM puzzles WHERE id = ?', [puzzleId]);
      if (puzzles.length === 0) {
        return res.status(404).json({ error: 'Puzzle not found' });
      }

      const puzzle = puzzles[0];
      const hint = hintNumber === 1 ? puzzle.hint1 : puzzle.hint2;

      if (!hint) {
        return res.status(400).json({ error: 'Hint not available' });
      }

      // Deduct hint and apply penalty
      await db.query(
        'UPDATE teams SET hints_used = hints_used + 1, total_score = total_score - 10 WHERE id = ?',
        [team.id]
      );

      return res.json({
        hint,
        hintsRemaining: 2 - team.hints_used,
        penaltyApplied: 10
      });
    }

    // GET /api/gameplay/progress - Get team progress
    if (req.method === 'GET' && path === '/progress') {
      const [teams] = await db.query('SELECT * FROM teams WHERE user_id = ?', [user.userId]);

      if (teams.length === 0) {
        return res.status(404).json({ error: 'Team not found' });
      }

      const team = teams[0];

      const [submissions] = await db.query(
        'SELECT COUNT(*) as total, SUM(is_correct) as correct FROM submissions WHERE team_id = ?',
        [team.id]
      );

      return res.json({
        team,
        submissions: {
          total: submissions[0].total || 0,
          correct: submissions[0].correct || 0
        }
      });
    }

    return res.status(404).json({ error: 'Endpoint not found' });

  } catch (error) {
    console.error('Gameplay API error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
};
