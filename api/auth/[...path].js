const { v4: uuidv4 } = require('uuid');
const bcrypt = require('bcryptjs');
const { getSupabase } = require('../../lib/supabase');
const { generateAccessToken, generateRefreshToken, verifyRefreshToken, setCorsHeaders } = require('../../lib/auth');

const SALT_ROUNDS = 10;

module.exports = async function handler(req, res) {
  setCorsHeaders(res);
  if (req.method === 'OPTIONS') return res.status(200).end();

  const supabase = getSupabase();
  const path = req.url.replace('/api/auth', '').split('?')[0];

  try {
    // ─── POST /api/auth/register ───
    if (req.method === 'POST' && path === '/register') {
      const { name, email, password, teamName, members } = req.body;

      if (!name || !email || !password || !teamName) {
        return res.status(400).json({ error: 'All fields are required' });
      }
      if (password.length < 8) {
        return res.status(400).json({ error: 'Password must be at least 8 characters' });
      }

      // Check existing user
      const { data: existing } = await supabase
        .from('users')
        .select('id')
        .eq('email', email)
        .limit(1);

      if (existing && existing.length > 0) {
        return res.status(409).json({ error: 'Email already registered' });
      }

      const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);
      const userId = uuidv4();
      const teamId = uuidv4();

      // Create user
      const { error: userErr } = await supabase.from('users').insert({
        id: userId,
        name,
        email,
        password_hash: passwordHash,
        role: 'team',
        is_verified: true
      });
      if (userErr) throw userErr;

      // Create team
      const { error: teamErr } = await supabase.from('teams').insert({
        id: teamId,
        user_id: userId,
        team_name: teamName
      });
      if (teamErr) throw teamErr;

      // Create team members
      if (members && Array.isArray(members) && members.length > 0) {
        const memberRows = members.map(m => ({
          id: uuidv4(),
          team_id: teamId,
          name: m.name,
          email: m.email,
          phone: m.phone || null,
          role: m.role || 'member'
        }));
        const { error: memErr } = await supabase.from('team_members').insert(memberRows);
        if (memErr) throw memErr;
      }

      return res.status(201).json({ message: 'Registration successful.', userId, email });
    }

    // ─── POST /api/auth/login ───
    if (req.method === 'POST' && path === '/login') {
      const { email, password } = req.body;

      if (!email || !password) {
        return res.status(400).json({ error: 'Email and password required' });
      }

      const { data: users, error: userErr } = await supabase
        .from('users')
        .select('*')
        .eq('email', email)
        .limit(1);

      if (userErr) throw userErr;
      if (!users || users.length === 0) {
        return res.status(401).json({ error: 'Invalid credentials' });
      }

      const user = users[0];

      const isValid = await bcrypt.compare(password, user.password_hash);
      if (!isValid) {
        return res.status(401).json({ error: 'Invalid credentials' });
      }

      let teamId = null;
      if (user.role === 'team') {
        const { data: teams } = await supabase
          .from('teams')
          .select('id')
          .eq('user_id', user.id)
          .limit(1);
        if (teams && teams.length > 0) teamId = teams[0].id;
      }

      const accessToken = generateAccessToken({
        userId: user.id,
        email: user.email,
        role: user.role,
        teamId
      });

      const refreshToken = generateRefreshToken({ userId: user.id });

      // Store refresh token
      const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
      await supabase.from('refresh_tokens').insert({
        user_id: user.id,
        token: refreshToken,
        expires_at: expiresAt
      });

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

    // ─── POST /api/auth/refresh ───
    if (req.method === 'POST' && path === '/refresh') {
      const { refreshToken } = req.body;
      if (!refreshToken) {
        return res.status(400).json({ error: 'Refresh token required' });
      }

      try {
        const decoded = verifyRefreshToken(refreshToken);

        const { data: tokens } = await supabase
          .from('refresh_tokens')
          .select('*')
          .eq('user_id', decoded.userId)
          .eq('token', refreshToken)
          .gt('expires_at', new Date().toISOString())
          .limit(1);

        if (!tokens || tokens.length === 0) {
          return res.status(401).json({ error: 'Invalid refresh token' });
        }

        const { data: users } = await supabase
          .from('users')
          .select('*')
          .eq('id', decoded.userId)
          .limit(1);

        if (!users || users.length === 0) {
          return res.status(401).json({ error: 'User not found' });
        }

        const user = users[0];
        let teamId = null;
        if (user.role === 'team') {
          const { data: teams } = await supabase
            .from('teams')
            .select('id')
            .eq('user_id', user.id)
            .limit(1);
          if (teams && teams.length > 0) teamId = teams[0].id;
        }

        const newAccessToken = generateAccessToken({
          userId: user.id,
          email: user.email,
          role: user.role,
          teamId
        });

        return res.json({ accessToken: newAccessToken });
      } catch (err) {
        return res.status(401).json({ error: 'Invalid refresh token' });
      }
    }

    // ─── POST /api/auth/logout ───
    if (req.method === 'POST' && path === '/logout') {
      const { refreshToken } = req.body;
      if (refreshToken) {
        await supabase.from('refresh_tokens').delete().eq('token', refreshToken);
      }
      return res.json({ message: 'Logged out successfully' });
    }

    return res.status(404).json({ error: 'Endpoint not found' });

  } catch (error) {
    console.error('Auth API error:', error);
    return res.status(500).json({
      error: 'Internal server error',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};
