// server/services/otpService.js
const db = require('../config/db');
const { supabaseAdmin } = require('../config/supabase');

const USE_SUPABASE = process.env.USE_SUPABASE === 'true';

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

  if (USE_SUPABASE) {
    try {
      const { error } = await supabaseAdmin
        .from('email_otps')
        .insert({
          user_id: userId,
          otp,
          purpose,
          expires_at: expiresAt.toISOString()
        });
      if (error) throw error;
    } catch (err) {
      console.error('Supabase createOTP error, falling back to MySQL:', err.message);
      await db.query(
        'INSERT INTO email_otps (user_id, otp, purpose, expires_at) VALUES (?, ?, ?, ?)',
        [userId, otp, purpose, expiresAt]
      );
    }
  } else {
    await db.query(
      'INSERT INTO email_otps (user_id, otp, purpose, expires_at) VALUES (?, ?, ?, ?)',
      [userId, otp, purpose, expiresAt]
    );
  }

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
  if (USE_SUPABASE) {
    try {
      const now = new Date().toISOString();

      const { data, error } = await supabaseAdmin
        .from('email_otps')
        .select('*')
        .eq('user_id', userId)
        .eq('otp', otp)
        .eq('purpose', purpose)
        .eq('used', false)
        .gt('expires_at', now)
        .order('created_at', { ascending: false })
        .limit(1);
      if (error) throw error;

      if (!data || data.length === 0) {
        return false;
      }

      // Mark as used
      const { error: updErr } = await supabaseAdmin
        .from('email_otps')
        .update({ used: true })
        .eq('id', data[0].id);
      if (updErr) throw updErr;

      return true;
    } catch (err) {
      console.error('Supabase verifyOTP error, falling back to MySQL:', err.message);
      return verifyOTPMysql(userId, otp, purpose);
    }
  } else {
    return verifyOTPMysql(userId, otp, purpose);
  }
}

/** MySQL fallback for verifyOTP */
async function verifyOTPMysql(userId, otp, purpose) {
  const [rows] = await db.query(
    `SELECT * FROM email_otps 
     WHERE user_id = ? AND otp = ? AND purpose = ? AND used = FALSE AND expires_at > NOW()
     ORDER BY created_at DESC LIMIT 1`,
    [userId, otp, purpose]
  );

  if (rows.length === 0) {
    return false;
  }

  await db.query('UPDATE email_otps SET used = TRUE WHERE id = ?', [rows[0].id]);

  return true;
}

/**
 * Invalidate all OTPs for a user
 * @param {String} userId
 * @param {String} purpose (optional)
 */
async function invalidateOTPs(userId, purpose = null) {
  if (USE_SUPABASE) {
    try {
      let query = supabaseAdmin
        .from('email_otps')
        .update({ used: true })
        .eq('user_id', userId);

      if (purpose) {
        query = query.eq('purpose', purpose);
      }

      const { error } = await query;
      if (error) throw error;
    } catch (err) {
      console.error('Supabase invalidateOTPs error, falling back to MySQL:', err.message);
      await invalidateOTPsMysql(userId, purpose);
    }
  } else {
    await invalidateOTPsMysql(userId, purpose);
  }
}

/** MySQL fallback for invalidateOTPs */
async function invalidateOTPsMysql(userId, purpose = null) {
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
