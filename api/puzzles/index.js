// Handler for /api/puzzles base path (GET list, POST create)
module.exports = async function handler(req, res) {
  // Set CORS headers early
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    var supabaseMod = require('../_lib/supabase');
    var authMod = require('../_lib/auth');
    var crypto = require('crypto');
    var getSupabase = supabaseMod.getSupabase;
    var verifyAuth = authMod.verifyAuth;
    var requireAdmin = authMod.requireAdmin;

    var supabase = getSupabase();
    
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
      query = query.order('level', { ascending: true }).order('puzzle_number', { ascending: true });
      var result = await query;
      if (result.error) throw result.error;
      return res.json({ puzzles: result.data || [] });
    }

    // ─── POST /api/puzzles — Create puzzle ───
    if (req.method === 'POST') {
      var body = req.body || {};
      var newId = crypto.randomUUID();
      var insertResult = await supabase.from('puzzles').insert({
        id: newId,
        title: body.title,
        description: body.description,
        puzzle_type: body.type || 'text',
        level: body.level,
        puzzle_number: body.puzzle_number || 1,
        points: body.points || 100,
        correct_answer: body.answer || body.correct_answer,
        puzzle_content: body.puzzle_content || null,
        puzzle_file_url: body.puzzle_file_url || null
      });
      if (insertResult.error) throw insertResult.error;
      return res.status(201).json({ message: 'Puzzle created', id: newId });
    }

    return res.status(405).json({ error: 'Method not allowed' });

  } catch (error) {
    console.error('Puzzles index API error:', {
      message: error.message,
      stack: error.stack,
      code: error.code,
      details: error.details
    });
    return res.status(500).json({ 
      error: 'Internal server error', 
      message: error.message,
      code: error.code,
      details: String(error.details || error.message || error) 
    });
  }
};
