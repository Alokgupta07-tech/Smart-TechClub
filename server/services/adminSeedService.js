// server/services/adminSeedService.js
const { v4: uuidv4 } = require('uuid');
const db = require('../config/db');
const { supabaseAdmin } = require('../config/supabase');
const { hashPassword, comparePassword } = require('../utils/password');

const USE_SUPABASE = process.env.USE_SUPABASE === 'true';

/**
 * Ensure an admin account exists in the configured database.
 * Uses env variables to avoid hardcoding credentials.
 */
async function ensureAdminUser() {
  const email = process.env.ADMIN_EMAIL;
  const password = process.env.ADMIN_PASSWORD;
  const name = process.env.ADMIN_NAME || 'Admin';
  const forceReset = String(process.env.ADMIN_FORCE_RESET || '').toLowerCase() === 'true';

  if (!email || !password) {
    return;
  }

  if (USE_SUPABASE) {
    try {
      // Check if user exists
      const { data: users, error: selErr } = await supabaseAdmin
        .from('users')
        .select('id, password_hash, role')
        .eq('email', email);
      if (selErr) throw selErr;

      if (!users || users.length === 0) {
        // Create admin user
        const passwordHash = await hashPassword(password);
        const adminId = uuidv4();

        const { error: insErr } = await supabaseAdmin
          .from('users')
          .insert({
            id: adminId,
            name,
            email,
            password_hash: passwordHash,
            role: 'admin',
            is_verified: true
          });
        if (insErr) throw insErr;

        console.log(`✅ Admin user created: ${email}`);
        return;
      }

      const existing = users[0];

      if (existing.role !== 'admin') {
        console.warn(`⚠️ Admin seed skipped: ${email} exists with role '${existing.role}'.`);
        return;
      }

      if (forceReset) {
        const passwordHash = await hashPassword(password);
        const { error: updErr } = await supabaseAdmin
          .from('users')
          .update({ password_hash: passwordHash })
          .eq('id', existing.id);
        if (updErr) throw updErr;

        console.log(`✅ Admin password reset: ${email}`);
        return;
      }

      const matches = await comparePassword(password, existing.password_hash);
      if (!matches) {
        console.warn(
          `⚠️ Admin password mismatch for ${email}. Set ADMIN_FORCE_RESET=true to reset on next startup.`
        );
      }
    } catch (err) {
      console.error('Supabase ensureAdminUser error, falling back to MySQL:', err.message);
      await ensureAdminUserMysql(email, password, name, forceReset);
    }
  } else {
    await ensureAdminUserMysql(email, password, name, forceReset);
  }
}

/** MySQL fallback for ensureAdminUser */
async function ensureAdminUserMysql(email, password, name, forceReset) {
  try {
    const [users] = await db.query('SELECT id, password_hash, role FROM users WHERE email = ?', [email]);

    if (users.length === 0) {
      const passwordHash = await hashPassword(password);
      const adminId = uuidv4();

      await db.query(
        'INSERT INTO users (id, name, email, password_hash, role, is_verified) VALUES (?, ?, ?, ?, ?, ?)',
        [adminId, name, email, passwordHash, 'admin', true]
      );

      console.log(`✅ Admin user created: ${email}`);
      return;
    }

    const existing = users[0];

    if (existing.role !== 'admin') {
      console.warn(`⚠️ Admin seed skipped: ${email} exists with role '${existing.role}'.`);
      return;
    }

    if (forceReset) {
      const passwordHash = await hashPassword(password);
      await db.query('UPDATE users SET password_hash = ? WHERE id = ?', [passwordHash, existing.id]);
      console.log(`✅ Admin password reset: ${email}`);
      return;
    }

    const matches = await comparePassword(password, existing.password_hash);
    if (!matches) {
      console.warn(
        `⚠️ Admin password mismatch for ${email}. Set ADMIN_FORCE_RESET=true to reset on next startup.`
      );
    }
  } catch (error) {
    console.error('❌ Admin seed failed:', error.message);
  }
}

module.exports = {
  ensureAdminUser,
};
