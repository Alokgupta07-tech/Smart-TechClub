const db = require('../config/db');

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
