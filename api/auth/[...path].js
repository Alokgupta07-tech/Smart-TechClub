const { v4: uuidv4 } = require('uuid');
const { getPool } = require('../_lib/db');
const { hashPassword, comparePassword } = require('../_lib/password');
const { generateAccessToken, generateRefreshToken, verifyRefreshToken } = require('../_lib/jwt');
const { setCorsHeaders } = require('../_lib/auth');

/**
 * Auth API - Serverless Handler
 * Handles: /api/auth/*
 */

module.exports = async function handler(req, res) {
  // Handle CORS preflight
  setCorsHeaders(res);
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const db = getPool();
  const path = req.url.replace('/api/auth', '').split('?')[0];

  try {
    // POST /api/auth/register
    if (req.method === 'POST' && path === '/register') {
      const { name, email, password, teamName, members } = req.body;

      if (!name || !email || !password || !teamName) {
        return res.status(400).json({ error: 'All fields are required' });
      }

      if (password.length < 8) {
        return res.status(400).json({ error: 'Password must be at least 8 characters' });
      }

      const [existing] = await db.query('SELECT id FROM users WHERE email = ?', [email]);
      if (existing.length > 0) {
        return res.status(409).json({ error: 'Email already registered' });
      }

      const passwordHash = await hashPassword(password);
      const userId = uuidv4();
      const teamId = uuidv4();

      await db.query(
        'INSERT INTO users (id, name, email, password_hash, role, is_verified) VALUES (?, ?, ?, ?, ?, ?)',
        [userId, name, email, passwordHash, 'team', true] // Auto-verify for serverless
      );

      await db.query(
        'INSERT INTO teams (id, user_id, team_name) VALUES (?, ?, ?)',
        [teamId, userId, teamName]
      );

      if (members && Array.isArray(members) && members.length > 0) {
        for (const member of members) {
          await db.query(
            'INSERT INTO team_members (id, team_id, name, email, phone, role) VALUES (?, ?, ?, ?, ?, ?)',
            [uuidv4(), teamId, member.name, member.email, member.phone || null, member.role || 'member']
          );
        }
      }

      return res.status(201).json({
        message: 'Registration successful.',
        userId,
        email
      });
    }

    // POST /api/auth/login
    if (req.method === 'POST' && path === '/login') {
      const { email, password } = req.body;

      if (!email || !password) {
        return res.status(400).json({ error: 'Email and password required' });
      }

      const [users] = await db.query('SELECT * FROM users WHERE email = ?', [email]);
      if (users.length === 0) {
        return res.status(401).json({ error: 'Invalid credentials' });
      }

      const user = users[0];

      let teamId = null;
      if (user.role === 'team') {
        const [teams] = await db.query('SELECT id FROM teams WHERE user_id = ?', [user.id]);
        if (teams.length > 0) {
          teamId = teams[0].id;
        }
      }

      const isValidPassword = await comparePassword(password, user.password_hash);
      if (!isValidPassword) {
        return res.status(401).json({ error: 'Invalid credentials' });
      }

      const accessToken = generateAccessToken({
        userId: user.id,
        email: user.email,
        role: user.role,
        teamId: teamId
      });

      const refreshToken = generateRefreshToken({ userId: user.id });

      const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
      await db.query(
        'INSERT INTO refresh_tokens (user_id, token, expires_at) VALUES (?, ?, ?)',
        [user.id, refreshToken, expiresAt]
      );

      return res.json({
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
    }

    // POST /api/auth/refresh
    if (req.method === 'POST' && path === '/refresh') {
      const { refreshToken } = req.body;

      if (!refreshToken) {
        return res.status(400).json({ error: 'Refresh token required' });
      }

      try {
        const decoded = verifyRefreshToken(refreshToken);

        const [tokens] = await db.query(
          'SELECT * FROM refresh_tokens WHERE user_id = ? AND token = ? AND expires_at > NOW()',
          [decoded.userId, refreshToken]
        );

        if (tokens.length === 0) {
          return res.status(401).json({ error: 'Invalid refresh token' });
        }

        const [users] = await db.query('SELECT * FROM users WHERE id = ?', [decoded.userId]);
        if (users.length === 0) {
          return res.status(401).json({ error: 'User not found' });
        }

        const user = users[0];

        let teamId = null;
        if (user.role === 'team') {
          const [teams] = await db.query('SELECT id FROM teams WHERE user_id = ?', [user.id]);
          if (teams.length > 0) {
            teamId = teams[0].id;
          }
        }

        const newAccessToken = generateAccessToken({
          userId: user.id,
          email: user.email,
          role: user.role,
          teamId: teamId
        });

        return res.json({ accessToken: newAccessToken });
      } catch (error) {
        return res.status(401).json({ error: 'Invalid refresh token' });
      }
    }

    // POST /api/auth/logout
    if (req.method === 'POST' && path === '/logout') {
      const { refreshToken } = req.body;
      if (refreshToken) {
        await db.query('DELETE FROM refresh_tokens WHERE token = ?', [refreshToken]);
      }
      return res.json({ message: 'Logged out successfully' });
    }

    return res.status(404).json({ error: 'Endpoint not found' });

  } catch (error) {
    console.error('Auth API error:', error);
    
    // Provide more specific error messages for debugging
    if (error.code === 'PROTOCOL_CONNECTION_LOST' || error.code === 'ECONNREFUSED') {
      return res.status(500).json({ 
        error: 'Database connection failed',
        details: process.env.NODE_ENV === 'development' ? error.message : 'Please try again later'
      });
    }
    
    return res.status(500).json({ 
      error: 'Internal server error',
      details: process.env.NODE_ENV === 'development' ? error.message : 'Please try again later'
    });
  }
};
