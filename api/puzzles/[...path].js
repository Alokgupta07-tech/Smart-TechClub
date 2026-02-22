module.exports = async function handler(req, res) {
  // Set CORS headers early
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    const { getSupabase } = require('../_lib/supabase');
    const { verifyAuth, requireAdmin, setCorsHeaders } = require('../_lib/auth');
    const crypto = require('crypto');

    const supabase = getSupabase();
    const path = req.url.replace('/api/puzzles', '').split('?')[0];
    
    // Parse level from query string manually (req.query may not exist)
    let level = null;
    const qmark = req.url.indexOf('?');
    if (qmark !== -1) {
      const params = new URLSearchParams(req.url.slice(qmark + 1));
      level = params.get('level');
    }
    // ─── GET /api/puzzles — List all puzzles (admin) ───
    if (req.method === 'GET' && (path === '' || path === '/')) {
      const authResult = verifyAuth(req);
      if (authResult.error) {
        return res.status(authResult.status).json({ error: authResult.error });
      }
      const adminCheck = requireAdmin(authResult.user);
      if (adminCheck) {
        return res.status(adminCheck.status).json({ error: adminCheck.error });
      }

      let query = supabase.from('puzzles').select('*');

      if (level) {
        query = query.eq('level', level);
      }

      query = query.order('level', { ascending: true }).order('puzzle_number', { ascending: true });

      const { data: puzzles, error } = await query;
      if (error) throw error;
      return res.json({ puzzles: puzzles || [] });
    }

    // ─── GET /api/puzzles/:id (requires admin auth) ───
    if (req.method === 'GET' && path.match(/^\/[^\/]+$/)) {
      const getAuthResult = verifyAuth(req);
      if (getAuthResult.error) {
        return res.status(getAuthResult.status).json({ error: getAuthResult.error });
      }
      const getAdminCheck = requireAdmin(getAuthResult.user);
      if (getAdminCheck) {
        return res.status(getAdminCheck.status).json({ error: getAdminCheck.error });
      }

      const puzzleId = path.slice(1);

      const { data: puzzle, error } = await supabase
        .from('puzzles')
        .select('*')
        .eq('id', puzzleId)
        .single();

      if (error || !puzzle) {
        return res.status(404).json({ error: 'Puzzle not found' });
      }
      return res.json(puzzle);
    }

    // ─── Protected admin routes for create/update/delete ───
    const authResult = verifyAuth(req);
    if (authResult.error) {
      return res.status(authResult.status).json({ error: authResult.error });
    }
    const adminCheck = requireAdmin(authResult.user);
    if (adminCheck) {
      return res.status(adminCheck.status).json({ error: adminCheck.error });
    }

    // ─── POST /api/puzzles — Create puzzle ───
    if (req.method === 'POST' && (path === '' || path === '/')) {
      const { title, description, type, level, puzzle_number, points, answer, correct_answer, puzzle_content, puzzle_file_url } = req.body;

      if (!title || !level) {
        return res.status(400).json({ error: 'title and level are required' });
      }

      const newId = crypto.randomUUID();
      const { error } = await supabase.from('puzzles').insert({
        id: newId,
        title,
        description,
        puzzle_type: type || 'text',
        level,
        puzzle_number: puzzle_number || 1,
        points: points || 100,
        correct_answer: answer || correct_answer,
        puzzle_content: puzzle_content || null,
        puzzle_file_url: puzzle_file_url || null
      });
      if (error) throw error;

      return res.status(201).json({ message: 'Puzzle created', id: newId });
    }

    // ─── PUT /api/puzzles/:id — Update puzzle ───
    if (req.method === 'PUT' && path.match(/^\/[^\/]+$/)) {
      const puzzleId = path.slice(1);
      const { title, description, type, level, puzzle_number, points, answer, correct_answer, puzzle_content, puzzle_file_url } = req.body;

      // Build update object with only defined fields to avoid nulling out unset fields
      const updates = {};
      if (title !== undefined) updates.title = title;
      if (description !== undefined) updates.description = description;
      if (type !== undefined) updates.puzzle_type = type;
      if (level !== undefined) updates.level = level;
      if (puzzle_number !== undefined) updates.puzzle_number = puzzle_number;
      if (points !== undefined) updates.points = points;
      if (answer !== undefined || correct_answer !== undefined) updates.correct_answer = answer || correct_answer;
      if (puzzle_content !== undefined) updates.puzzle_content = puzzle_content;
      if (puzzle_file_url !== undefined) updates.puzzle_file_url = puzzle_file_url;

      const { error } = await supabase
        .from('puzzles')
        .update(updates)
        .eq('id', puzzleId);
      if (error) throw error;

      return res.json({ message: 'Puzzle updated' });
    }

    // ─── DELETE /api/puzzles/:id ───
    if (req.method === 'DELETE' && path.match(/^\/[^\/]+$/)) {
      const puzzleId = path.slice(1);

      const { error } = await supabase
        .from('puzzles')
        .delete()
        .eq('id', puzzleId);
      if (error) throw error;

      return res.json({ message: 'Puzzle deleted' });
    }

    return res.status(404).json({ error: 'Endpoint not found' });

  } catch (error) {
    console.error('Puzzles path API error:', {
      message: error.message,
      stack: error.stack,
      code: error.code,
      details: error.details,
      path: req.url
    });
    return res.status(500).json({ error: 'Internal server error' });
  }
};
