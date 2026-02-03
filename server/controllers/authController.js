const { v4: uuidv4 } = require('uuid');
const db = require('../config/db');
const { hashPassword, comparePassword } = require('../utils/password');
const { generateAccessToken, generateRefreshToken, verifyRefreshToken } = require('../utils/jwt');
const { createOTP, verifyOTP, invalidateOTPs } = require('../services/otpService');
const { sendVerificationEmail, send2FACode, sendPasswordResetEmail } = require('../services/emailService');
const { logAudit } = require('../services/auditService');

/**
 * AUTHENTICATION CONTROLLER
 * Handles all authentication flows
 */

/**
 * REGISTER - Team Only
 * POST /api/auth/register
 */
async function register(req, res) {
  try {
    const { name, email, password, teamName, members } = req.body;

    // Validation
    if (!name || !email || !password || !teamName) {
      return res.status(400).json({ error: 'All fields are required' });
    }

    if (password.length < 8) {
      return res.status(400).json({ error: 'Password must be at least 8 characters' });
    }

    // Check if email exists
    const [existing] = await db.query('SELECT id FROM users WHERE email = ?', [email]);
    if (existing.length > 0) {
      return res.status(409).json({ error: 'Email already registered' });
    }

    // Hash password
    const passwordHash = await hashPassword(password);
    const userId = uuidv4();
    const teamId = uuidv4();

    // Create user
    await db.query(
      'INSERT INTO users (id, name, email, password_hash, role, is_verified) VALUES (?, ?, ?, ?, ?, ?)',
      [userId, name, email, passwordHash, 'team', false]
    );

    // Create team
    await db.query(
      'INSERT INTO teams (id, user_id, team_name) VALUES (?, ?, ?)',
      [teamId, userId, teamName]
    );

    // Save all team members if provided
    if (members && Array.isArray(members) && members.length > 0) {
      for (const member of members) {
        await db.query(
          'INSERT INTO team_members (id, team_id, name, email, phone, role) VALUES (?, ?, ?, ?, ?, ?)',
          [uuidv4(), teamId, member.name, member.email, member.phone || null, member.role || 'member']
        );
      }
    }

    // Generate OTP
    const otp = await createOTP(userId, 'verify');

    // Send verification email
    try {
      await sendVerificationEmail(email, name, otp);
    } catch (emailError) {
      console.error('Email send failed:', emailError.message);
      // Continue even if email fails
    }

    // Log audit
    await logAudit(userId, 'REGISTER', req, `Team: ${teamName}`);

    res.status(201).json({
      message: 'Registration successful. Please verify your email.',
      userId,
      email
    });

  } catch (error) {
    console.error('Register error:', error);
    res.status(500).json({ error: 'Registration failed' });
  }
}

/**
 * VERIFY EMAIL
 * POST /api/auth/verify-email
 */
async function verifyEmail(req, res) {
  try {
    const { userId, otp } = req.body;

    if (!userId || !otp) {
      return res.status(400).json({ error: 'User ID and OTP required' });
    }

    // Verify OTP
    const isValid = await verifyOTP(userId, otp, 'verify');
    if (!isValid) {
      await logAudit(userId, 'EMAIL_VERIFY_FAILED', req, 'Invalid or expired OTP');
      return res.status(400).json({ error: 'Invalid or expired OTP' });
    }

    // Mark user as verified
    await db.query('UPDATE users SET is_verified = TRUE WHERE id = ?', [userId]);

    // Log audit
    await logAudit(userId, 'EMAIL_VERIFIED', req);

    res.json({ message: 'Email verified successfully. You can now login.' });

  } catch (error) {
    console.error('Verify email error:', error);
    res.status(500).json({ error: 'Verification failed' });
  }
}

/**
 * RESEND OTP
 * POST /api/auth/resend-otp
 */
async function resendOTP(req, res) {
  try {
    const { userId, purpose } = req.body;

    if (!userId || !purpose) {
      return res.status(400).json({ error: 'User ID and purpose required' });
    }

    // Get user info
    const [users] = await db.query('SELECT email, name FROM users WHERE id = ?', [userId]);
    if (users.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    const { email, name } = users[0];

    // Invalidate old OTPs
    await invalidateOTPs(userId, purpose);

    // Generate new OTP
    const otp = await createOTP(userId, purpose);

    // Send email based on purpose
    try {
      if (purpose === 'verify') {
        await sendVerificationEmail(email, name, otp);
      } else if (purpose === '2fa') {
        await send2FACode(email, name, otp);
      } else if (purpose === 'reset') {
        await sendPasswordResetEmail(email, name, otp);
      }
    } catch (emailError) {
      console.error('Email send failed:', emailError.message);
    }

    // Log audit
    await logAudit(userId, 'OTP_RESENT', req, `Purpose: ${purpose}`);

    res.json({ message: 'OTP has been resent to your email.' });

  } catch (error) {
    console.error('Resend OTP error:', error);
    res.status(500).json({ error: 'Failed to resend OTP' });
  }
}

/**
 * LOGIN - Admin & Team
 * POST /api/auth/login
 */
async function login(req, res) {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password required' });
    }

    // Get user
    const [users] = await db.query('SELECT * FROM users WHERE email = ?', [email]);
    if (users.length === 0) {
      await logAudit(null, 'LOGIN_FAILED', req, `Email: ${email} - User not found`);
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const user = users[0];

    // Get team_id if user is a team member
    let teamId = null;
    if (user.role === 'team') {
      const [teams] = await db.query('SELECT id FROM teams WHERE user_id = ?', [user.id]);
      if (teams.length > 0) {
        teamId = teams[0].id;
      }
    }

    // Verify password
    const isValidPassword = await comparePassword(password, user.password_hash);
    if (!isValidPassword) {
      await logAudit(user.id, 'LOGIN_FAILED', req, 'Invalid password');
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    // Check if email verified (team only)
    if (user.role === 'team' && !user.is_verified) {
      await logAudit(user.id, 'LOGIN_FAILED', req, 'Email not verified');
      return res.status(403).json({ error: 'Please verify your email first', code: 'EMAIL_NOT_VERIFIED' });
    }

    // Check 2FA
    if (user.two_fa_enabled) {
      // Generate and send 2FA code
      const otp = await createOTP(user.id, '2fa');
      try {
        await send2FACode(user.email, user.name, otp);
      } catch (emailError) {
        console.error('2FA email failed:', emailError.message);
      }

      await logAudit(user.id, 'LOGIN_2FA_SENT', req);

      return res.json({
        message: '2FA code sent to your email',
        requireTwoFa: true,
        userId: user.id
      });
    }

    // Generate tokens
    const accessToken = generateAccessToken({
      userId: user.id,
      email: user.email,
      role: user.role,
      teamId: teamId
    });

    const refreshToken = generateRefreshToken({ userId: user.id });

    // Store refresh token
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days
    await db.query(
      'INSERT INTO refresh_tokens (user_id, token, expires_at) VALUES (?, ?, ?)',
      [user.id, refreshToken, expiresAt]
    );

    // Log audit
    await logAudit(user.id, 'LOGIN_SUCCESS', req);

    res.json({
      message: 'Login successful',
      accessToken,
      refreshToken,
      role: user.role,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role
      }
    });

  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Login failed' });
  }
}

/**
 * VERIFY 2FA
 * POST /api/auth/verify-2fa
 */
async function verify2FA(req, res) {
  try {
    const { userId, otp } = req.body;

    if (!userId || !otp) {
      return res.status(400).json({ error: 'User ID and OTP required' });
    }

    // Verify OTP
    const isValid = await verifyOTP(userId, otp, '2fa');
    if (!isValid) {
      await logAudit(userId, '2FA_FAILED', req, 'Invalid or expired OTP');
      return res.status(400).json({ error: 'Invalid or expired 2FA code' });
    }

    // Get user
    const [users] = await db.query('SELECT * FROM users WHERE id = ?', [userId]);
    if (users.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    const user = users[0];

    // Generate tokens
    const accessToken = generateAccessToken({
      userId: user.id,
      email: user.email,
      role: user.role
    });

    const refreshToken = generateRefreshToken({ userId: user.id });

    // Store refresh token
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    await db.query(
      'INSERT INTO refresh_tokens (user_id, token, expires_at) VALUES (?, ?, ?)',
      [user.id, refreshToken, expiresAt]
    );

    // Log audit
    await logAudit(user.id, '2FA_SUCCESS', req);

    res.json({
      message: '2FA verification successful',
      accessToken,
      refreshToken,
      role: user.role,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role
      }
    });

  } catch (error) {
    console.error('2FA verify error:', error);
    res.status(500).json({ error: '2FA verification failed' });
  }
}

/**
 * REFRESH TOKEN
 * POST /api/auth/refresh
 */
async function refresh(req, res) {
  try {
    const { refreshToken } = req.body;

    if (!refreshToken) {
      return res.status(400).json({ error: 'Refresh token required' });
    }

    // Verify refresh token
    let decoded;
    try {
      decoded = verifyRefreshToken(refreshToken);
    } catch (error) {
      return res.status(401).json({ error: 'Invalid refresh token' });
    }

    // Check if token exists in database
    const [tokens] = await db.query(
      'SELECT * FROM refresh_tokens WHERE token = ? AND expires_at > NOW()',
      [refreshToken]
    );

    if (tokens.length === 0) {
      return res.status(401).json({ error: 'Refresh token expired or invalid' });
    }

    // Get user
    const [users] = await db.query('SELECT * FROM users WHERE id = ?', [decoded.userId]);
    if (users.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    const user = users[0];

    // Generate new access token
    const accessToken = generateAccessToken({
      userId: user.id,
      email: user.email,
      role: user.role
    });

    // Log audit
    await logAudit(user.id, 'TOKEN_REFRESH', req);

    res.json({ accessToken });

  } catch (error) {
    console.error('Refresh token error:', error);
    res.status(500).json({ error: 'Token refresh failed' });
  }
}

/**
 * LOGOUT
 * POST /api/auth/logout
 */
async function logout(req, res) {
  try {
    const { refreshToken } = req.body;
    const userId = req.user.userId;

    // Delete refresh token
    if (refreshToken) {
      await db.query('DELETE FROM refresh_tokens WHERE token = ?', [refreshToken]);
    }

    // Log audit
    await logAudit(userId, 'LOGOUT', req);

    res.json({ message: 'Logged out successfully' });

  } catch (error) {
    console.error('Logout error:', error);
    res.status(500).json({ error: 'Logout failed' });
  }
}

/**
 * FORGOT PASSWORD
 * POST /api/auth/forgot-password
 */
async function forgotPassword(req, res) {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({ error: 'Email required' });
    }

    // Get user
    const [users] = await db.query('SELECT * FROM users WHERE email = ?', [email]);
    if (users.length === 0) {
      // Don't reveal if email exists
      return res.json({ message: 'If email exists, reset code has been sent' });
    }

    const user = users[0];

    // Generate OTP
    const otp = await createOTP(user.id, 'reset');

    // Send reset email
    try {
      await sendPasswordResetEmail(user.email, user.name, otp);
    } catch (emailError) {
      console.error('Password reset email failed:', emailError.message);
    }

    // Log audit
    await logAudit(user.id, 'PASSWORD_RESET_REQUEST', req);

    res.json({
      message: 'Password reset code sent to your email',
      userId: user.id
    });

  } catch (error) {
    console.error('Forgot password error:', error);
    res.status(500).json({ error: 'Password reset request failed' });
  }
}

/**
 * RESET PASSWORD
 * POST /api/auth/reset-password
 */
async function resetPassword(req, res) {
  try {
    const { userId, otp, newPassword } = req.body;

    if (!userId || !otp || !newPassword) {
      return res.status(400).json({ error: 'All fields required' });
    }

    if (newPassword.length < 8) {
      return res.status(400).json({ error: 'Password must be at least 8 characters' });
    }

    // Verify OTP
    const isValid = await verifyOTP(userId, otp, 'reset');
    if (!isValid) {
      await logAudit(userId, 'PASSWORD_RESET_FAILED', req, 'Invalid or expired OTP');
      return res.status(400).json({ error: 'Invalid or expired reset code' });
    }

    // Hash new password
    const passwordHash = await hashPassword(newPassword);

    // Update password
    await db.query('UPDATE users SET password_hash = ? WHERE id = ?', [passwordHash, userId]);

    // Invalidate all refresh tokens (force re-login)
    await db.query('DELETE FROM refresh_tokens WHERE user_id = ?', [userId]);

    // Log audit
    await logAudit(userId, 'PASSWORD_RESET_SUCCESS', req);

    res.json({ message: 'Password reset successful. Please login with your new password.' });

  } catch (error) {
    console.error('Reset password error:', error);
    res.status(500).json({ error: 'Password reset failed' });
  }
}

module.exports = {
  register,
  verifyEmail,
  resendOTP,
  login,
  verify2FA,
  refresh,
  logout,
  forgotPassword,
  resetPassword
};
