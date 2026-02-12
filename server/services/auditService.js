// server/services/auditService.js
const db = require('../config/db');
const { supabaseAdmin } = require('../config/supabase');
const USE_SUPABASE = process.env.USE_SUPABASE === 'true';

/**
 * Audit Logging Service
 * Records all security-relevant events
 */

/**
 * Log an audit event
 * @param {String} userId - User ID or null
 * @param {String} action - Action performed
 * @param {Object} req - Express request object
 * @param {String} details - Additional details (optional)
 */
async function logAudit(userId, action, req, details = null) {
  const ipAddress = req.ip || req.connection.remoteAddress || null;
  const userAgent = req.get('user-agent') || null;

  if (USE_SUPABASE) {
    try {
      const { error } = await supabaseAdmin
        .from('audit_logs')
        .insert({
          user_id: userId,
          action,
          ip_address: ipAddress,
          user_agent: userAgent,
          details
        });

      if (error) {
        console.error('Supabase audit log failed:', error.message);
      }
    } catch (error) {
      console.error('Audit log failed (Supabase):', error.message);
    }
    return;
  }

  // MySQL fallback
  try {
    await db.query(
      'INSERT INTO audit_logs (user_id, action, ip_address, user_agent, details) VALUES (?, ?, ?, ?, ?)',
      [userId, action, ipAddress, userAgent, details]
    );
  } catch (error) {
    console.error('Audit log failed:', error.message);
  }
}

/**
 * Get audit logs with pagination
 * @param {Number} page
 * @param {Number} limit
 * @returns {Promise<Object>} { logs, total, page, pages }
 */
async function getAuditLogs(page = 1, limit = 50) {
  const offset = (page - 1) * limit;

  if (USE_SUPABASE) {
    try {
      // 1. Fetch audit logs with pagination
      const { data: logs, error: logsError } = await supabaseAdmin
        .from('audit_logs')
        .select('*')
        .order('created_at', { ascending: false })
        .range(offset, offset + limit - 1);

      if (logsError) {
        console.error('Supabase audit logs fetch error:', logsError.message);
        return { logs: [], total: 0, page, pages: 0 };
      }

      // 2. Get unique user_ids and fetch users
      const userIds = [...new Set((logs || []).map(l => l.user_id).filter(Boolean))];
      let usersMap = {};

      if (userIds.length > 0) {
        const { data: users, error: usersError } = await supabaseAdmin
          .from('users')
          .select('id, name, email, role')
          .in('id', userIds);

        if (!usersError && users) {
          for (const u of users) {
            usersMap[u.id] = u;
          }
        }
      }

      // 3. Merge user data into logs
      const enrichedLogs = (logs || []).map(log => ({
        ...log,
        name: usersMap[log.user_id]?.name || null,
        email: usersMap[log.user_id]?.email || null,
        role: usersMap[log.user_id]?.role || null
      }));

      // 4. Get total count
      const { count: total, error: countError } = await supabaseAdmin
        .from('audit_logs')
        .select('*', { count: 'exact', head: true });

      if (countError) {
        console.error('Supabase audit logs count error:', countError.message);
      }

      const totalCount = total || 0;

      return {
        logs: enrichedLogs,
        total: totalCount,
        page,
        pages: Math.ceil(totalCount / limit)
      };
    } catch (error) {
      console.error('getAuditLogs error (Supabase):', error.message);
      return { logs: [], total: 0, page, pages: 0 };
    }
  }

  // MySQL fallback
  const [logs] = await db.query(
    `SELECT a.*, u.name, u.email, u.role 
     FROM audit_logs a 
     LEFT JOIN users u ON a.user_id = u.id 
     ORDER BY a.created_at DESC 
     LIMIT ? OFFSET ?`,
    [limit, offset]
  );

  const [[{ total }]] = await db.query('SELECT COUNT(*) as total FROM audit_logs');

  return {
    logs,
    total,
    page,
    pages: Math.ceil(total / limit)
  };
}

/**
 * Get audit logs for a specific user
 * @param {String} userId
 * @param {Number} limit
 * @returns {Promise<Array>} Audit logs
 */
async function getUserAuditLogs(userId, limit = 20) {
  if (USE_SUPABASE) {
    try {
      const { data: logs, error } = await supabaseAdmin
        .from('audit_logs')
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .limit(limit);

      if (error) {
        console.error('Supabase user audit logs error:', error.message);
        return [];
      }

      return logs || [];
    } catch (error) {
      console.error('getUserAuditLogs error (Supabase):', error.message);
      return [];
    }
  }

  // MySQL fallback
  const [logs] = await db.query(
    'SELECT * FROM audit_logs WHERE user_id = ? ORDER BY created_at DESC LIMIT ?',
    [userId, limit]
  );

  return logs;
}

module.exports = {
  logAudit,
  getAuditLogs,
  getUserAuditLogs
};
