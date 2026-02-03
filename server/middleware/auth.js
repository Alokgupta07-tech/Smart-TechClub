const { verifyAccessToken } = require('../utils/jwt');

/**
 * Authentication Middleware
 * Verifies JWT access token and attaches user to req
 */

async function authMiddleware(req, res, next) {
  try {
    // Get token from Authorization header
    const authHeader = req.headers.authorization;
    
    console.log('Auth middleware: URL:', req.originalUrl, 'Auth header exists:', !!authHeader);
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      console.log('Auth middleware: No valid token provided');
      return res.status(401).json({ error: 'No token provided' });
    }

    const token = authHeader.substring(7); // Remove 'Bearer ' prefix
    console.log('Auth middleware: Token received, verifying...');

    // Verify token
    const decoded = verifyAccessToken(token);
    console.log('Auth middleware: Token valid, user:', decoded.email, 'role:', decoded.role);

    // Attach user info to request
    req.user = {
      id: decoded.userId,
      userId: decoded.userId,
      email: decoded.email,
      role: decoded.role,
      team_id: decoded.teamId || null
    };

    next();
  } catch (error) {
    console.error('Auth middleware error:', error.name, error.message);
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({ error: 'Token expired', code: 'TOKEN_EXPIRED' });
    }
    if (error.name === 'JsonWebTokenError') {
      return res.status(401).json({ error: 'Invalid token' });
    }
    return res.status(500).json({ error: 'Authentication failed' });
  }
}

/**
 * Role-based access control middleware
 * Checks if user has required role
 */
function requireRole(role) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Authentication required' });
    }
    
    if (req.user.role !== role) {
      return res.status(403).json({ 
        error: 'Access denied',
        message: `This endpoint requires ${role} role`
      });
    }
    
    next();
  };
}

/**
 * Authenticate token and attach user info
 */
function authenticateToken(req, res, next) {
  return authMiddleware(req, res, next);
}

module.exports = authMiddleware;
module.exports.authenticateToken = authenticateToken;
module.exports.requireRole = requireRole;
