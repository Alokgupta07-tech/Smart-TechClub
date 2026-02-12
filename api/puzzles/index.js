// Handler for /api/puzzles base path (GET list, POST create)
module.exports = async function handler(req, res) {
  // Set CORS headers early
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();

  // DEBUG: Test calling verifyAuth
  try {
    const { getSupabase } = require('../_lib/supabase');
    const { verifyAuth, requireAdmin } = require('../_lib/auth');
    const authResult = verifyAuth(req);
    return res.status(200).json({ debug: 'step4-verifyAuth', result: authResult });
  } catch (e) {
    return res.status(500).json({ debug: 'step4-fail', error: e.message, stack: e.stack });
  }
};
