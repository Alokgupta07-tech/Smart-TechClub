module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
  res.setHeader('Access-Control-Allow-Headers', 'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version, Authorization');
  res.setHeader('Access-Control-Allow-Credentials', 'true');

  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    const crypto = require('crypto');
    const bcrypt = require('bcryptjs');
    const { getSupabase } = require('../_lib/supabase');
    const { generateAccessToken, generateRefreshToken, verifyRefreshToken } = require('../_lib/auth');

    const SALT_ROUNDS = 10;
    const supabase = getSupabase();
    const path = req.url.replace('/api/auth', '').split('?')[0];

    // ─── POST /api/auth/register ───
    if (req.method === 'POST' && path === '/register') {
      const { name, email, password, teamName, members } = req.body;

      if (!name || !email || !password || !teamName) {
        return res.status(400).json({ error: 'All fields are required' });
      }
      if (password.length < 8) {
        return res.status(400).json({ error: 'Password must be at least 8 characters' });
      }

      const { data: existing } = await supabase
        .from('users')
        .select('id')
        .eq('email', email)
        .limit(1);

      if (existing && existing.length > 0) {
        return res.status(409).json({ error: 'Email already registered' });
      }

      const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);
      const userId = crypto.randomUUID();
      const teamId = crypto.randomUUID();

      const { error: userErr } = await supabase.from('users').insert({
        id: userId,
        name: name,
        email: email,
        password_hash: passwordHash,
        role: 'team',
        is_verified: true
      });
      if (userErr) throw userErr;

      const { error: teamErr } = await supabase.from('teams').insert({
        id: teamId,
        user_id: userId,
        team_name: teamName
      });
      if (teamErr) throw teamErr;

      if (members && Array.isArray(members) && members.length > 0) {
        const memberRows = members.map(function(m) {
          return {
            id: crypto.randomUUID(),
            team_id: teamId,
            member_name: m.name,
            member_email: m.email || null,
            member_role: m.role || 'member',
            is_leader: false
          };
        });
        const { error: memErr } = await supabase.from('team_members').insert(memberRows);
        if (memErr) throw memErr;
      }

      return res.status(201).json({ message: 'Registration successful.', userId: userId, email: email });
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

      var teamId = null;
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
        teamId: teamId
      });

      const refreshToken = generateRefreshToken({ userId: user.id });

      const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
      await supabase.from('refresh_tokens').insert({
        user_id: user.id,
        token: refreshToken,
        expires_at: expiresAt
      });

      return res.json({
        message: 'Login successful',
        accessToken: accessToken,
        refreshToken: refreshToken,
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
      const refreshTkn = req.body.refreshToken;
      if (!refreshTkn) {
        return res.status(400).json({ error: 'Refresh token required' });
      }

      try {
        const decoded = verifyRefreshToken(refreshTkn);

        const { data: tokens } = await supabase
          .from('refresh_tokens')
          .select('*')
          .eq('user_id', decoded.userId)
          .eq('token', refreshTkn)
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
        var tid = null;
        if (user.role === 'team') {
          const { data: teams } = await supabase
            .from('teams')
            .select('id')
            .eq('user_id', user.id)
            .limit(1);
          if (teams && teams.length > 0) tid = teams[0].id;
        }

        const newAccessToken = generateAccessToken({
          userId: user.id,
          email: user.email,
          role: user.role,
          teamId: tid
        });

        return res.json({ accessToken: newAccessToken });
      } catch (err) {
        return res.status(401).json({ error: 'Invalid refresh token' });
      }
    }

    // ─── POST /api/auth/logout ───
    if (req.method === 'POST' && path === '/logout') {
      const logoutToken = req.body.refreshToken;
      if (logoutToken) {
        await supabase.from('refresh_tokens').delete().eq('token', logoutToken);
      }
      return res.json({ message: 'Logged out successfully' });
    }

    return res.status(404).json({ error: 'Endpoint not found' });

  } catch (error) {
    console.error('Auth API error:', error);
    return res.status(500).json({
      error: 'Internal server error',
      details: error.message,
      stack: error.stack
    });
  }
};
