/**
 * Role-based Access Control Middleware
 * Ensures only authorized roles can access routes
 */

/**
 * Admin-only middleware
 * Requires authMiddleware to run first
 */
function adminOnly(req, res, next) {
  if (!req.user) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  if (req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Admin access required' });
  }

  next();
}

/**
 * Team-only middleware
 * Requires authMiddleware to run first
 */
function teamOnly(req, res, next) {
  if (!req.user) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  if (req.user.role !== 'team') {
    return res.status(403).json({ error: 'Team access only' });
  }

  next();
}

module.exports = {
  adminOnly,
  teamOnly
};
