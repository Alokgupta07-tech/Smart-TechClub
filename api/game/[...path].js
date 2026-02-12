const { v4: uuidv4 } = require('uuid');
const { getSupabase } = require('../_lib/supabase');
const { verifyAuth, requireAdmin, setCorsHeaders } = require('../_lib/auth');

module.exports = async function handler(req, res) {
  setCorsHeaders(res);
  if (req.method === 'OPTIONS') return res.status(200).end();

  const supabase = getSupabase();
  const path = req.url.replace('/api/game', '').split('?')[0];

  try {
    // ─── GET /api/game/state — Public ───
    if (req.method === 'GET' && path === '/state') {
      const { data: states, error } = await supabase
        .from('game_state')
        .select('*')
        .limit(1);

      if (error) throw error;

      if (!states || states.length === 0) {
        // Create default game state
        const { error: insertErr } = await supabase.from('game_state').insert({
          id: 1,
          phase: 'waiting',
          current_level: 1,
          max_level: 5,
          start_time: null,
          end_time: null
        });
        if (insertErr) throw insertErr;

        return res.json({
          id: 1, phase: 'waiting', current_level: 1,
          max_level: 5, start_time: null, end_time: null
        });
      }

      return res.json(states[0]);
    }

    // ─── Protected admin routes below ───
    const authResult = verifyAuth(req);
    if (authResult.error) {
      return res.status(authResult.status).json({ error: authResult.error, code: authResult.code });
    }
    const adminCheck = requireAdmin(authResult.user);
    if (adminCheck) {
      return res.status(adminCheck.status).json({ error: adminCheck.error });
    }

    // ─── POST /api/game/start ───
    if (req.method === 'POST' && path === '/start') {
      const { error } = await supabase
        .from('game_state')
        .update({ phase: 'active', start_time: new Date().toISOString() })
        .eq('id', 1);
      if (error) throw error;
      return res.json({ message: 'Game started' });
    }

    // ─── POST /api/game/pause ───
    if (req.method === 'POST' && path === '/pause') {
      const { error } = await supabase
        .from('game_state')
        .update({ phase: 'paused' })
        .eq('id', 1);
      if (error) throw error;
      return res.json({ message: 'Game paused' });
    }

    // ─── POST /api/game/resume ───
    if (req.method === 'POST' && path === '/resume') {
      const { error } = await supabase
        .from('game_state')
        .update({ phase: 'active' })
        .eq('id', 1);
      if (error) throw error;
      return res.json({ message: 'Game resumed' });
    }

    // ─── POST /api/game/end ───
    if (req.method === 'POST' && path === '/end') {
      const { error } = await supabase
        .from('game_state')
        .update({ phase: 'ended', end_time: new Date().toISOString() })
        .eq('id', 1);
      if (error) throw error;
      return res.json({ message: 'Game ended' });
    }

    // ─── POST /api/game/reset ───
    if (req.method === 'POST' && path === '/reset') {
      const { error: gsErr } = await supabase
        .from('game_state')
        .update({ phase: 'waiting', current_level: 1, start_time: null, end_time: null })
        .eq('id', 1);
      if (gsErr) throw gsErr;

      // Reset all teams
      const { error: tErr } = await supabase
        .from('teams')
        .update({ current_level: 1, total_score: 0, status: 'waiting' })
        .neq('id', '00000000-0000-0000-0000-000000000000'); // update all rows
      if (tErr) throw tErr;

      return res.json({ message: 'Game reset' });
    }

    // ─── POST /api/game/level/unlock ───
    if (req.method === 'POST' && path === '/level/unlock') {
      const { level } = req.body;
      const { error } = await supabase
        .from('game_state')
        .update({ current_level: level })
        .eq('id', 1);
      if (error) throw error;
      return res.json({ message: `Level ${level} unlocked` });
    }

    // ─── POST /api/game/broadcast ───
    if (req.method === 'POST' && path === '/broadcast') {
      const { message, type } = req.body;
      const { error } = await supabase.from('broadcasts').insert({
        id: uuidv4(),
        message,
        type: type || 'info',
        created_at: new Date().toISOString()
      });
      if (error) throw error;
      return res.json({ message: 'Broadcast sent' });
    }

    return res.status(404).json({ error: 'Endpoint not found' });

  } catch (error) {
    console.error('Game API error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
};
