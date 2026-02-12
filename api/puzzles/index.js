// Handler for /api/puzzles base path (GET list, POST create)
module.exports = async function handler(req, res) {
  // Set CORS headers early
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    const { getSupabase } = require('../_lib/supabase');
    const { verifyAuth, requireAdmin } = require('../_lib/auth');
    const crypto = require('crypto');

    const supabase = getSupabase();
    
    // Parse level from query string
    var level = null;
    var qmark = req.url.indexOf('?');
    if (qmark !== -1) {
      var params = new URLSearchParams(req.url.slice(qmark + 1));
      level = params.get('level');
    }

    // Auth required for all puzzle operations
    var authResult = verifyAuth(req);
    if (authResult.error) {
      return res.status(authResult.status).json({ error: authResult.error });
    }
    var adminCheck = requireAdmin(authResult.user);
    if (adminCheck) {
      return res.status(adminCheck.status).json({ error: adminCheck.error });
    }

    // ─── GET /api/puzzles — List all puzzles (admin) ───
    if (req.method === 'GET') {
      var query = supabase.from('puzzles').select('*');
      if (level) {
        query = query.eq('level', level);
      }
      query = query.order('level', { ascending: true }).order('sequence', { ascending: true });
      var result = await query;
      if (result.error) throw result.error;
      return res.json(result.data || []);
    }

    // ─── POST /api/puzzles — Create puzzle ───
    if (req.method === 'POST') {
      var body = req.body || {};
      var newId = crypto.randomUUID();
      var insertResult = await supabase.from('puzzles').insert({
        id: newId,
        title: body.title,
        description: body.description,
        type: body.type || 'text',
        level: body.level,
        points: body.points || 100,
        answer: body.answer,
        hint1: body.hint1 || null,
        hint2: body.hint2 || null,
        sequence: body.sequence || 1
      });
      if (insertResult.error) throw insertResult.error;
      return res.status(201).json({ message: 'Puzzle created', id: newId });
    }

    return res.status(405).json({ error: 'Method not allowed' });

  } catch (error) {
    console.error('Puzzles API error:', error);
    return res.status(500).json({ error: 'Internal server error', details: String(error.message || error) });
  }
};
