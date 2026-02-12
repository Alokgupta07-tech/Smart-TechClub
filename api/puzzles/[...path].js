const { v4: uuidv4 } = require('uuid');
const { getSupabase } = require('../../lib/supabase');
const { verifyAuth, requireAdmin, setCorsHeaders } = require('../../lib/auth');

module.exports = async function handler(req, res) {
  setCorsHeaders(res);
  if (req.method === 'OPTIONS') return res.status(200).end();

  const supabase = getSupabase();
  const path = req.url.replace('/api/puzzles', '').split('?')[0];
  const url = new URL(req.url, `http://${req.headers.host}`);

  try {
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

      const level = url.searchParams.get('level');
      let query = supabase.from('puzzles').select('*');

      if (level) {
        query = query.eq('level', level);
      }

      query = query.order('level', { ascending: true }).order('sequence', { ascending: true });

      const { data: puzzles, error } = await query;
      if (error) throw error;
      return res.json(puzzles || []);
    }

    // ─── GET /api/puzzles/:id ───
    if (req.method === 'GET' && path.match(/^\/[^\/]+$/)) {
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
      const { title, description, type, level, points, answer, hint1, hint2, sequence } = req.body;

      const newId = uuidv4();
      const { error } = await supabase.from('puzzles').insert({
        id: newId,
        title,
        description,
        type: type || 'text',
        level,
        points: points || 100,
        answer,
        hint1: hint1 || null,
        hint2: hint2 || null,
        sequence: sequence || 1
      });
      if (error) throw error;

      return res.status(201).json({ message: 'Puzzle created', id: newId });
    }

    // ─── PUT /api/puzzles/:id — Update puzzle ───
    if (req.method === 'PUT' && path.match(/^\/[^\/]+$/)) {
      const puzzleId = path.slice(1);
      const { title, description, type, level, points, answer, hint1, hint2, sequence } = req.body;

      const { error } = await supabase
        .from('puzzles')
        .update({ title, description, type, level, points, answer, hint1, hint2, sequence })
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
    console.error('Puzzles API error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
};
