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

  const path = req.url.replace('/api/notifications', '').split('?')[0];

  try {
    // ─── GET /api/notifications/unread ───
    if (req.method === 'GET' && (path === '/unread' || path === '/unread/')) {
      // Try to fetch from notifications table; if it doesn't exist, return empty
      try {
        const target = teamId || userId;
        const { data, error } = await supabase
          .from('notifications')
          .select('*')
          .eq('team_id', target)
          .eq('is_read', false)
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

    // ─── PATCH /api/notifications/read-all ───
    if (req.method === 'PATCH' && (path === '/read-all' || path === '/read-all/')) {
      try {
        const target = teamId || userId;
        const { error } = await supabase
          .from('notifications')
          .update({ is_read: true })
          .eq('team_id', target)
          .eq('is_read', false);

        if (error && error.code !== '42P01') throw error;
      } catch (e) {
        // Table doesn't exist — just succeed silently
      }
      return res.json({ message: 'All notifications marked as read' });
    }

    // ─── PATCH /api/notifications/:id/read ───
    const readMatch = path.match(/^\/([^\/]+)\/read\/?$/);
    if (req.method === 'PATCH' && readMatch) {
      const notificationId = readMatch[1];
      try {
        const { error } = await supabase
          .from('notifications')
          .update({ is_read: true })
          .eq('id', notificationId);

        if (error && error.code !== '42P01') throw error;
      } catch (e) {
        // Graceful degradation
      }
      return res.json({ message: 'Notification marked as read' });
    }

    // ─── POST /api/notifications/broadcast (admin) ───
    if (req.method === 'POST' && (path === '/broadcast' || path === '/broadcast/')) {
      if (authResult.user.role !== 'admin') {
        return res.status(403).json({ error: 'Admin access required' });
      }

      const { title, message, priority } = req.body || {};
      if (!title || !message) {
        return res.status(400).json({ error: 'Title and message are required' });
      }

      try {
        // Get all teams to broadcast to
        const { data: teams } = await supabase.from('teams').select('id');
        if (teams && teams.length > 0) {
          var notifications = teams.map(function(t) {
            return {
              team_id: t.id,
              notification_type: 'broadcast',
              title: title,
              message: message,
              priority: priority || 'normal',
              is_read: false
            };
          });

          const { error } = await supabase.from('notifications').insert(notifications);
          if (error && error.code !== '42P01') throw error;
        }
      } catch (e) {
        return res.status(500).json({ error: 'Failed to broadcast notification' });
      }
      return res.json({ message: 'Notification broadcast sent' });
    }

    return res.status(404).json({ error: 'Endpoint not found' });

  } catch (error) {
    console.error('Notifications API error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
};
