/**
 * Input Sanitization & Validation Utilities
 * Protects against XSS, injection attacks, and invalid input
 */

const validator = require('validator');

/**
 * Sanitize string input - removes HTML tags, trims whitespace
 * @param {string} input - Raw input string
 * @returns {string} Sanitized string
 */
function sanitizeString(input) {
  if (typeof input !== 'string') return '';
  return validator.escape(validator.trim(input));
}

/**
 * Sanitize email - validates and normalizes
 * @param {string} email - Raw email string
 * @returns {string|null} Normalized email or null if invalid
 */
function sanitizeEmail(email) {
  if (typeof email !== 'string') return null;
  const trimmed = validator.trim(email).toLowerCase();
  if (!validator.isEmail(trimmed)) return null;
  return validator.normalizeEmail(trimmed);
}

/**
 * Validate UUID format
 * @param {string} id - UUID string
 * @returns {boolean} True if valid UUID
 */
function isValidUUID(id) {
  if (typeof id !== 'string') return false;
  return validator.isUUID(id);
}

/**
 * Fields that should NOT be HTML-escaped because they contain user content
 * that needs to be compared literally (e.g., puzzle answers, messages)
 */
const SKIP_ESCAPE_FIELDS = ['password', 'answer', 'submitted_answer', 'message', 'content'];

/**
 * Sanitize object recursively - escapes all string values
 * @param {object} obj - Object to sanitize
 * @returns {object} Sanitized object
 */
function sanitizeObject(obj) {
  if (obj === null || obj === undefined) return obj;
  if (typeof obj === 'string') return sanitizeString(obj);
  if (typeof obj !== 'object') return obj;
  if (Array.isArray(obj)) return obj.map(sanitizeObject);
  
  const sanitized = {};
  for (const [key, value] of Object.entries(obj)) {
    const keyLower = key.toLowerCase();
    // Skip fields that need literal values (passwords, puzzle answers, messages)
    if (SKIP_ESCAPE_FIELDS.some(f => keyLower.includes(f))) {
      sanitized[key] = typeof value === 'string' ? validator.trim(value) : value;
    } else {
      sanitized[key] = sanitizeObject(value);
    }
  }
  return sanitized;
}

/**
 * Validate password strength
 * @param {string} password - Password to validate
 * @returns {object} { valid: boolean, errors: string[] }
 */
function validatePassword(password) {
  const errors = [];
  
  if (!password || typeof password !== 'string') {
    return { valid: false, errors: ['Password is required'] };
  }
  
  if (password.length < 8) {
    errors.push('Password must be at least 8 characters');
  }
  
  if (!/[A-Z]/.test(password)) {
    errors.push('Password must contain at least one uppercase letter');
  }
  
  if (!/[a-z]/.test(password)) {
    errors.push('Password must contain at least one lowercase letter');
  }
  
  if (!/[0-9]/.test(password)) {
    errors.push('Password must contain at least one number');
  }
  
  return { valid: errors.length === 0, errors };
}

/**
 * Rate limit key generator based on IP + user agent
 * @param {object} req - Express request object
 * @returns {string} Unique key for rate limiting
 */
function getRateLimitKey(req) {
  const ip = req.ip || req.connection.remoteAddress || 'unknown';
  return `${ip}`;
}

/**
 * Check if string contains potential SQL injection
 * @param {string} input - Input to check
 * @returns {boolean} True if suspicious
 */
function hasSQLInjection(input) {
  if (typeof input !== 'string') return false;
  const sqlPatterns = [
    /(\b(SELECT|INSERT|UPDATE|DELETE|DROP|UNION|ALTER|CREATE|TRUNCATE)\b)/i,
    /(--)|(\/\*)|(\*\/)/,
    /(;[\s]*$)/,
    /(\bOR\b[\s]*\d+[\s]*=[\s]*\d+)/i,
    /(\bAND\b[\s]*\d+[\s]*=[\s]*\d+)/i
  ];
  return sqlPatterns.some(pattern => pattern.test(input));
}

/**
 * Middleware to sanitize request body
 */
function sanitizeBody(req, res, next) {
  if (req.body && typeof req.body === 'object') {
    req.body = sanitizeObject(req.body);
  }
  next();
}

/**
 * Middleware to validate common inputs
 */
function validateInputs(req, res, next) {
  // Check for SQL injection in query params only
  // (body is safe because all DB queries use parameterized placeholders)
  for (const [key, value] of Object.entries(req.query)) {
    if (hasSQLInjection(String(value))) {
      return res.status(400).json({ error: 'Invalid input detected' });
    }
  }
  
  next();
}

module.exports = {
  sanitizeString,
  sanitizeEmail,
  isValidUUID,
  sanitizeObject,
  validatePassword,
  getRateLimitKey,
  hasSQLInjection,
  sanitizeBody,
  validateInputs
};
