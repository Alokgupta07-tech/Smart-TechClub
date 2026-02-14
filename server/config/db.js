/**
 * Database Connection Module
 * 
 * Supports both MySQL and Supabase backends
 * Set USE_SUPABASE=true in .env to use Supabase
 */

require('dotenv').config();

const USE_SUPABASE = process.env.USE_SUPABASE === 'true';

let db;

if (USE_SUPABASE) {
  // Use Supabase
  const { supabaseAdmin } = require('./supabase');
  
  console.log('🔄 Using Supabase database backend');
  
  // Create a MySQL-compatible query interface
  db = {
    query: async (sql, params = []) => {
      // Use Supabase's underlying PostgreSQL
      const { data, error } = await supabaseAdmin.rpc('execute_raw_sql', { 
        sql_query: sql,
        params: params
      });
      
      if (error) {
        // Fallback to direct Supabase operations
        return require('./supabaseDb').query(sql, params);
      }
      return [data, null];
    },
    getConnection: () => Promise.resolve({
      query: db.query,
      release: () => {},
      execute: db.query,
      beginTransaction: () => Promise.resolve(),
      commit: () => Promise.resolve(),
      rollback: () => Promise.resolve()
    })
  };
  
  // Test connection
  (async () => {
    try {
      const { data, error } = await supabaseAdmin.from('users').select('count').limit(1);
      if (!error) {
        console.log('✅ Supabase database connected');
      } else if (error.code === '42P01') {
        console.log('⚠️ Supabase connected but tables not created. Run the schema.sql in Supabase SQL Editor.');
      } else {
        console.warn('⚠️ Supabase connection warning:', error.message);
      }
    } catch (err) {
      console.error('❌ Supabase connection failed:', err.message);
    }
  })();
  
} else {
  // Use MySQL (default)
  const mysql = require('mysql2/promise');
  
  const pool = mysql.createPool({
    host: process.env.DB_HOST || 'localhost',
    port: process.env.DB_PORT || 3306,
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'lockdown_hq',
    waitForConnections: true,
    connectionLimit: parseInt(process.env.DB_CONNECTION_LIMIT) || 150, // 1:1 pool for 150 users
    queueLimit: 200, // Queue requests instead of failing immediately
    enableKeepAlive: true,
    keepAliveInitialDelay: 10000 // 10 seconds
  });

  // Test connection on startup
  pool.getConnection()
    .then(connection => {
      console.log('✅ MySQL database connected');
      connection.release();
    })
    .catch(err => {
      console.error('❌ MySQL connection failed:', err.message);
      // Don't exit - allow app to start and show errors
    });
    
  db = pool;
}

module.exports = db;
