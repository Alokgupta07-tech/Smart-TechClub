const mysql = require('mysql2/promise');

/**
 * Serverless MySQL Connection
 * Creates a connection pool optimized for serverless environments
 */

let pool = null;

function getPool() {
  if (!pool) {
    pool = mysql.createPool({
      host: process.env.DB_HOST,
      port: process.env.DB_PORT || 3306,
      user: process.env.DB_USER,
      password: process.env.DB_PASSWORD || '',
      database: process.env.DB_NAME || 'lockdown_hq',
      waitForConnections: true,
      connectionLimit: 5, // Lower limit for serverless
      queueLimit: 0,
      enableKeepAlive: false, // Disable for serverless
      connectTimeout: 10000,
    });
  }
  return pool;
}

module.exports = { getPool };
