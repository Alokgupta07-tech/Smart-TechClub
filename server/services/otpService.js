const db = require('../config/db');

/**
 * OTP Service
 * Generates, stores, and validates OTP codes
 */

/**
 * Generate 6-digit OTP
 * @returns {String} 6-digit code
 */
function generateOTP() {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

/**
 * Store OTP in database
 * @param {String} userId
 * @param {String} purpose - 'verify', 'reset', '2fa'
 * @returns {Promise<String>} Generated OTP
 */
async function createOTP(userId, purpose) {
  const otp = generateOTP();
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

  await db.query(
    'INSERT INTO email_otps (user_id, otp, purpose, expires_at) VALUES (?, ?, ?, ?)',
    [userId, otp, purpose, expiresAt]
  );

  return otp;
}

/**
 * Verify OTP
 * @param {String} userId
 * @param {String} otp
 * @param {String} purpose
 * @returns {Promise<Boolean>} True if valid
 */
async function verifyOTP(userId, otp, purpose) {
  const [rows] = await db.query(
    `SELECT * FROM email_otps 
     WHERE user_id = ? AND otp = ? AND purpose = ? AND used = FALSE AND expires_at > NOW()
     ORDER BY created_at DESC LIMIT 1`,
    [userId, otp, purpose]
  );

  if (rows.length === 0) {
    return false;
  }

  // Mark as used
  await db.query('UPDATE email_otps SET used = TRUE WHERE id = ?', [rows[0].id]);

  return true;
}

/**
 * Invalidate all OTPs for a user
 * @param {String} userId
 * @param {String} purpose (optional)
 */
async function invalidateOTPs(userId, purpose = null) {
  if (purpose) {
    await db.query('UPDATE email_otps SET used = TRUE WHERE user_id = ? AND purpose = ?', [userId, purpose]);
  } else {
    await db.query('UPDATE email_otps SET used = TRUE WHERE user_id = ?', [userId]);
  }
}

module.exports = {
  generateOTP,
  createOTP,
  verifyOTP,
  invalidateOTPs
};
