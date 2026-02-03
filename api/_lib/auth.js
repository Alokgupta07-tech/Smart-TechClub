const { verifyAccessToken } = require('./jwt');

/**
 * Verify authentication for serverless functions
 */
function verifyAuth(req) {
  const authHeader = req.headers.authorization;
  
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return { error: 'No token provided', status: 401 };
  }

  const token = authHeader.split(' ')[1];
  
  try {
    const decoded = verifyAccessToken(token);
    return { user: decoded };
  } catch (error) {
    if (error.name === 'TokenExpiredError') {
      return { error: 'Token expired', code: 'TOKEN_EXPIRED', status: 401 };
    }
    return { error: 'Invalid token', status: 401 };
  }
}

/**
 * Check if user is admin
 */
function requireAdmin(user) {
  if (!user || user.role !== 'admin') {
    return { error: 'Admin access required', status: 403 };
  }
  return null;
}

/**
 * Check if user is team
 */
function requireTeam(user) {
  if (!user || user.role !== 'team') {
    return { error: 'Team access required', status: 403 };
  }
  return null;
}

/**
 * CORS headers for serverless functions
 */
function setCorsHeaders(res) {
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
  res.setHeader('Access-Control-Allow-Headers', 'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version, Authorization');
}

module.exports = {
  verifyAuth,
  requireAdmin,
  requireTeam,
  setCorsHeaders
};
