module.exports = async function handler(req, res) {
  const { getSupabase } = require('../_lib/supabase');
  const { verifyAuth, setCorsHeaders } = require('../_lib/auth');

  setCorsHeaders(res);
  if (req.method === 'OPTIONS') return res.status(200).end();

  const supabase = getSupabase();

  // All notification routes require auth
  const authResult = verifyAuth(req);
  if (authResult.error) {
    return res.status(authResult.status).json({ error: authResult.error, code: authResult.code });
  }
  const userId = authResult.user.userId;
  const teamId = authResult.user.teamId;

  try {
    // GET /api/notifications/unread
    if (req.method === 'GET') {
      // Try to fetch from notifications table; if it doesn't exist, return empty
      try {
        let query = supabase
          .from('notifications')
          .select('*')
          .eq('is_read', false);

        // Filter by team_id if available, otherwise by user_id
        if (teamId) {
          query = query.eq('team_id', teamId);
        } else {
          query = query.eq('user_id', userId);
        }

        const { data, error } = await query
          .order('created_at', { ascending: false })
          .limit(20);

        if (error) {
          // Table doesn't exist — return empty
          if (error.code === '42P01' || error.message.includes('does not exist')) {
            return res.json({ count: 0, notifications: [] });
          }
          throw error;
        }

        return res.json({ count: (data || []).length, notifications: data || [] });
      } catch (e) {
        // Gracefully degrade — return empty notifications
        return res.json({ count: 0, notifications: [] });
      }
    }

    return res.status(405).json({ error: 'Method not allowed' });

  } catch (error) {
    console.error('Notifications unread API error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
};
