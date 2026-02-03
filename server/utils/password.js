const bcrypt = require('bcrypt');

/**
 * Password Hashing Utilities
 * Uses bcrypt with 10 rounds
 */

const SALT_ROUNDS = 10;

/**
 * Hash a plaintext password
 * @param {String} password
 * @returns {Promise<String>} Hashed password
 */
async function hashPassword(password) {
  return bcrypt.hash(password, SALT_ROUNDS);
}

/**
 * Compare plaintext password with hash
 * @param {String} password - Plaintext password
 * @param {String} hash - Stored hash
 * @returns {Promise<Boolean>} True if match
 */
async function comparePassword(password, hash) {
  return bcrypt.compare(password, hash);
}

module.exports = {
  hashPassword,
  comparePassword
};
