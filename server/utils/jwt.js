const jwt = require('jsonwebtoken');
require('dotenv').config();

/**
 * JWT Utility Functions
 * Handles token generation and verification
 */

const JWT_ACCESS_SECRET = process.env.JWT_ACCESS_SECRET;
const JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET;
const JWT_ACCESS_EXPIRY = process.env.JWT_ACCESS_EXPIRY || '15m';
const JWT_REFRESH_EXPIRY = process.env.JWT_REFRESH_EXPIRY || '7d';

/**
 * Generate Access Token (short-lived)
 * @param {Object} payload - User data { userId, email, role }
 * @returns {String} JWT token
 */
function generateAccessToken(payload) {
  return jwt.sign(payload, JWT_ACCESS_SECRET, { expiresIn: JWT_ACCESS_EXPIRY });
}

/**
 * Generate Refresh Token (long-lived)
 * @param {Object} payload - User data { userId }
 * @returns {String} JWT token
 */
function generateRefreshToken(payload) {
  return jwt.sign(payload, JWT_REFRESH_SECRET, { expiresIn: JWT_REFRESH_EXPIRY });
}

/**
 * Verify Access Token
 * @param {String} token
 * @returns {Object} Decoded payload or throws error
 */
function verifyAccessToken(token) {
  return jwt.verify(token, JWT_ACCESS_SECRET);
}

/**
 * Verify Refresh Token
 * @param {String} token
 * @returns {Object} Decoded payload or throws error
 */
function verifyRefreshToken(token) {
  return jwt.verify(token, JWT_REFRESH_SECRET);
}

module.exports = {
  generateAccessToken,
  generateRefreshToken,
  verifyAccessToken,
  verifyRefreshToken
};
