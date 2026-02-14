const rateLimit = require('express-rate-limit');

/**
 * Rate Limiting Middleware
 * Protects against brute-force attacks
 */

const WINDOW_MS = parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 15 * 60 * 1000; // 15 minutes
const MAX_ATTEMPTS = parseInt(process.env.RATE_LIMIT_MAX_ATTEMPTS) || 20; // Increased from 5 to support shared networks

/**
 * Auth rate limiter (login, OTP verification, password reset)
 * 5 attempts per 15 minutes per IP
 */
const authLimiter = rateLimit({
  windowMs: WINDOW_MS,
  max: MAX_ATTEMPTS,
  message: {
    error: 'Too many attempts. Please try again later.',
    code: 'RATE_LIMIT_EXCEEDED'
  },
  standardHeaders: true, // Return rate limit info in `RateLimit-*` headers
  legacyHeaders: false,  // Disable `X-RateLimit-*` headers
  handler: (req, res) => {
    res.status(429).json({
      error: 'Too many attempts from this IP, please try again after 15 minutes',
      code: 'RATE_LIMIT_EXCEEDED',
      retryAfter: Math.ceil(WINDOW_MS / 60000) // minutes
    });
  }
});

/**
 * Strict rate limiter for sensitive operations
 * 3 attempts per 15 minutes per IP
 */
const strictLimiter = rateLimit({
  windowMs: WINDOW_MS,
  max: 3,
  message: {
    error: 'Too many sensitive operation attempts',
    code: 'RATE_LIMIT_EXCEEDED'
  },
  handler: (req, res) => {
    res.status(429).json({
      error: 'Too many attempts from this IP, please try again after 15 minutes',
      code: 'RATE_LIMIT_EXCEEDED',
      retryAfter: Math.ceil(WINDOW_MS / 60000)
    });
  }
});

module.exports = {
  authLimiter,
  strictLimiter
};
