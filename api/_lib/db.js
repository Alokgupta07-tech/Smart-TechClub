const { query: supabaseQuery } = require('./supabase');

/**
 * Serverless Database Connection
 * Uses Supabase as the database backend via a MySQL-compatible query adapter
 */

function getPool() {
  return {
    query: supabaseQuery
  };
}

module.exports = { getPool };
