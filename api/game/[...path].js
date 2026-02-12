const crypto = require('crypto');
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
        // Return default game state (will be created by seed data)
        return res.json({
          game_active: false,
          current_level: 1,
          level1_open: true,
          level2_open: false,
          game_started_at: null,
          game_ended_at: null
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
        .update({ game_active: true, game_started_at: new Date().toISOString() })
        .limit(1);
      if (error) throw error;
      return res.json({ message: 'Game started' });
    }

    // ─── POST /api/game/pause ───
    if (req.method === 'POST' && path === '/pause') {
      const { error } = await supabase
        .from('game_state')
        .update({ game_active: false })
        .limit(1);
      if (error) throw error;
      return res.json({ message: 'Game paused' });
    }

    // ─── POST /api/game/resume ───
    if (req.method === 'POST' && path === '/resume') {
      const { error } = await supabase
        .from('game_state')
        .update({ game_active: true })
        .limit(1);
      if (error) throw error;
      return res.json({ message: 'Game resumed' });
    }

    // ─── POST /api/game/end ───
    if (req.method === 'POST' && path === '/end') {
      const { error } = await supabase
        .from('game_state')
        .update({ game_active: false, game_ended_at: new Date().toISOString() })
        .limit(1);
      if (error) throw error;
      return res.json({ message: 'Game ended' });
    }

    // ─── POST /api/game/reset ───
    if (req.method === 'POST' && path === '/reset') {
      const { error: gsErr } = await supabase
        .from('game_state')
        .update({ 
          game_active: false, 
          current_level: 1, 
          level1_open: true, 
          level2_open: false,
          game_started_at: null, 
          game_ended_at: null 
        })
        .limit(1);
      if (gsErr) throw gsErr;

      // Reset all teams
      const { error: tErr } = await supabase
        .from('teams')
        .update({ level: 1, status: 'waiting' })
        .neq('id', '00000000-0000-0000-0000-000000000000'); // update all rows
      if (tErr) throw tErr;

      return res.json({ message: 'Game reset' });
    }

    // ─── POST /api/game/level/unlock ───
    if (req.method === 'POST' && path === '/level/unlock') {
      const { level } = req.body;
      const updates = { current_level: level };
      if (level === 1) updates.level1_open = true;
      if (level === 2) updates.level2_open = true;
      
      const { error } = await supabase
        .from('game_state')
        .update(updates)
        .limit(1);
      if (error) throw error;
      return res.json({ message: `Level ${level} unlocked` });
    }

    // ─── POST /api/game/broadcast ───
    if (req.method === 'POST' && path === '/broadcast') {
      const { message, type } = req.body;
      const { error } = await supabase.from('broadcasts').insert({
        id: crypto.randomUUID(),
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
