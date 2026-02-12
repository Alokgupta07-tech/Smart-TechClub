// Handler for /api/puzzles base path (GET list, POST create)
module.exports = async function handler(req, res) {
  // Set CORS headers early
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();
  
  // Debug checkpoint - return immediately to test
  // return res.status(200).json({ debug: 'handler reached', method: req.method });

  try {
    const { getSupabase } = require('../_lib/supabase');
    const { verifyAuth, requireAdmin } = require('../_lib/auth');
    const crypto = require('crypto');

    const supabase = getSupabase();
    
    // Parse level from query string
    let level = null;
    const qmark = req.url.indexOf('?');
    if (qmark !== -1) {
      const params = new URLSearchParams(req.url.slice(qmark + 1));
      level = params.get('level');
    }

    // Auth required for all puzzle operations
    const authResult = verifyAuth(req);
    if (authResult.error) {
      return res.status(authResult.status).json({ error: authResult.error });
    }
    const adminCheck = requireAdmin(authResult.user);
    if (adminCheck) {
      return res.status(adminCheck.status).json({ error: adminCheck.error });
    }

    // ─── GET /api/puzzles — List all puzzles (admin) ───
    if (req.method === 'GET') {
      let query = supabase.from('puzzles').select('*');
      if (level) {
        query = query.eq('level', level);
      }
      query = query.order('level', { ascending: true }).order('sequence', { ascending: true });
      const { data: puzzles, error } = await query;
      if (error) throw error;
      return res.json(puzzles || []);
    }

    // ─── POST /api/puzzles — Create puzzle ───
    if (req.method === 'POST') {
      const { title, description, type, level: lvl, points, answer, hint1, hint2, sequence } = req.body;
      const newId = crypto.randomUUID();
      const { error } = await supabase.from('puzzles').insert({
        id: newId,
        title,
        description,
        type: type || 'text',
        level: lvl,
        points: points || 100,
        answer,
        hint1: hint1 || null,
        hint2: hint2 || null,
        sequence: sequence || 1
      });
      if (error) throw error;
      return res.status(201).json({ message: 'Puzzle created', id: newId });
    }

    return res.status(405).json({ error: 'Method not allowed' });

  } catch (error) {
    console.error('Puzzles API error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
};
