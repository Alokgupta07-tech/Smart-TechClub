/**
 * Supabase Client Configuration
 * 
 * This file configures the Supabase client for database operations.
 * Uses service_role key for backend operations (bypasses RLS)
 */

const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_KEY;
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY;

if (!supabaseUrl) {
  console.error('❌ Missing SUPABASE_URL in .env');
}

if (!supabaseServiceKey) {
  console.error('❌ Missing SUPABASE_SERVICE_KEY in .env');
}

// Check if keys look valid (Supabase keys are typically JWT tokens starting with 'eyJ')
const isValidKey = (key) => key && (key.startsWith('eyJ') || key.startsWith('sb_'));

if (supabaseServiceKey && !isValidKey(supabaseServiceKey)) {
  console.warn('⚠️ SUPABASE_SERVICE_KEY format may be incorrect. Expected JWT token starting with "eyJ"');
  console.warn('   Get the correct key from: Supabase Dashboard → Settings → API → service_role');
}

// Admin client (bypasses Row Level Security) - use for backend operations
let supabaseAdmin = null;
let supabase = null;

try {
  supabaseAdmin = createClient(supabaseUrl || '', supabaseServiceKey || '', {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  });

  // Public client (respects RLS) - use for frontend-facing operations
  supabase = createClient(supabaseUrl || '', supabaseAnonKey || supabaseServiceKey || '', {
    auth: {
      autoRefreshToken: true,
      persistSession: true
    }
  });
  
  console.log('✅ Supabase client initialized');
} catch (error) {
  console.error('❌ Failed to create Supabase client:', error.message);
}

// Test connection on startup
async function testConnection() {
  if (!supabaseAdmin) return;
  
  try {
    const { data, error } = await supabaseAdmin.from('users').select('count').limit(1);
    if (error && error.code !== 'PGRST116') {
      // PGRST116 = table doesn't exist yet, which is fine on first run
      if (error.code !== '42P01') {
        console.warn('⚠️ Supabase query test:', error.message);
        if (error.message.includes('Invalid API key')) {
          console.error('❌ Invalid Supabase API key!');
          console.error('   Please get the correct keys from your Supabase project:');
          console.error('   1. Go to https://supabase.com/dashboard');
          console.error('   2. Select your project');
          console.error('   3. Go to Settings → API');
          console.error('   4. Copy "anon public" key for SUPABASE_ANON_KEY');
          console.error('   5. Copy "service_role" key for SUPABASE_SERVICE_KEY');
        }
      }
    } else {
      console.log('✅ Supabase connection verified:', supabaseUrl);
    }
  } catch (err) {
    console.error('❌ Supabase connection test failed:', err.message);
  }
}

testConnection();

module.exports = {
  supabase,
  supabaseAdmin
};
