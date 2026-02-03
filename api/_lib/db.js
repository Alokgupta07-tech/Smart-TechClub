const mysql = require('mysql2/promise');

/**
 * Serverless MySQL Connection
 * Creates a connection pool optimized for serverless environments
 */

let pool = null;

function getPool() {
  if (!pool) {
    const dbConfig = {
      host: process.env.DATABASE_HOST || process.env.DB_HOST,
      port: parseInt(process.env.DATABASE_PORT || process.env.DB_PORT || '3306'),
      user: process.env.DATABASE_USER || process.env.DB_USER,
      password: process.env.DATABASE_PASSWORD || process.env.DB_PASSWORD || '',
      database: process.env.DATABASE_DBNAME || process.env.DB_NAME || 'lockdown_hq',
      waitForConnections: true,
      connectionLimit: 5,
      queueLimit: 0,
      enableKeepAlive: false,
      connectTimeout: 30000,
      acquireTimeout: 30000,
      ssl: {
        rejectUnauthorized: false
      }
    };

    // Debug logging for serverless (remove in production)
    console.log('Database config:', {
      host: dbConfig.host,
      port: dbConfig.port,
      user: dbConfig.user,
      database: dbConfig.database,
      hasPassword: !!dbConfig.password
    });

    pool = mysql.createPool(dbConfig);
  }
  return pool;
}

module.exports = { getPool };
