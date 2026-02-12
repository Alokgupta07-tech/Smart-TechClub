const { createClient } = require('@supabase/supabase-js');

/**
 * Supabase Client for Vercel Serverless Functions
 */

let supabase = null;

function getSupabase() {
  if (!supabase) {
    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_KEY;

    if (!supabaseUrl || !supabaseServiceKey) {
      throw new Error('Missing Supabase environment variables');
    }

    supabase = createClient(supabaseUrl, supabaseServiceKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false
      }
    });
  }
  return supabase;
}

/**
 * MySQL-compatible query adapter for Supabase
 * Allows gradual migration from MySQL syntax
 */
async function query(sql, params = []) {
  const client = getSupabase();
  
  // Simple query parser for common operations
  const trimmedSql = sql.trim().toLowerCase();
  
  if (trimmedSql.startsWith('select')) {
    return handleSelect(client, sql, params);
  } else if (trimmedSql.startsWith('insert')) {
    return handleInsert(client, sql, params);
  } else if (trimmedSql.startsWith('update')) {
    return handleUpdate(client, sql, params);
  } else if (trimmedSql.startsWith('delete')) {
    return handleDelete(client, sql, params);
  }
  
  throw new Error('Unsupported query type');
}

async function handleSelect(client, sql, params) {
  // Extract table name from "SELECT ... FROM table_name ..."
  const tableMatch = sql.match(/from\s+(\w+)/i);
  if (!tableMatch) throw new Error('Could not parse table name from SELECT');
  
  const tableName = tableMatch[1];
  let query = client.from(tableName).select('*');
  
  // Handle WHERE clauses
  const whereMatch = sql.match(/where\s+(.+?)(?:\s+order|\s+limit|\s*$)/i);
  if (whereMatch && params.length > 0) {
    const conditions = whereMatch[1];
    let paramIndex = 0;
    
    // Handle simple equality conditions
    const eqMatches = conditions.matchAll(/(\w+)\s*=\s*\?/g);
    for (const match of eqMatches) {
      query = query.eq(match[1], params[paramIndex++]);
    }
  }
  
  // Handle ORDER BY
  const orderMatch = sql.match(/order\s+by\s+(\w+)(?:\s+(asc|desc))?/i);
  if (orderMatch) {
    const ascending = !orderMatch[2] || orderMatch[2].toLowerCase() === 'asc';
    query = query.order(orderMatch[1], { ascending });
  }
  
  // Handle LIMIT
  const limitMatch = sql.match(/limit\s+(\d+)/i);
  if (limitMatch) {
    query = query.limit(parseInt(limitMatch[1]));
  }
  
  const { data, error } = await query;
  if (error) throw error;
  
  return [data];
}

async function handleInsert(client, sql, params) {
  const tableMatch = sql.match(/insert\s+into\s+(\w+)\s*\(([^)]+)\)/i);
  if (!tableMatch) throw new Error('Could not parse INSERT statement');
  
  const tableName = tableMatch[1];
  const columns = tableMatch[2].split(',').map(c => c.trim());
  
  const data = {};
  columns.forEach((col, idx) => {
    data[col] = params[idx];
  });
  
  const { data: result, error } = await client.from(tableName).insert(data).select();
  if (error) throw error;
  
  return [{ insertId: result?.[0]?.id, affectedRows: 1 }];
}

async function handleUpdate(client, sql, params) {
  const tableMatch = sql.match(/update\s+(\w+)\s+set\s+(.+?)\s+where\s+(.+)/i);
  if (!tableMatch) throw new Error('Could not parse UPDATE statement');
  
  const tableName = tableMatch[1];
  const setClause = tableMatch[2];
  const whereClause = tableMatch[3];
  
  // Parse SET clause
  const setMatches = setClause.matchAll(/(\w+)\s*=\s*\?/g);
  const updateData = {};
  let paramIndex = 0;
  for (const match of setMatches) {
    updateData[match[1]] = params[paramIndex++];
  }
  
  // Parse WHERE clause (simple equality)
  const whereMatches = whereClause.matchAll(/(\w+)\s*=\s*\?/g);
  let query = client.from(tableName).update(updateData);
  for (const match of whereMatches) {
    query = query.eq(match[1], params[paramIndex++]);
  }
  
  const { error, count } = await query;
  if (error) throw error;
  
  return [{ affectedRows: count || 1 }];
}

async function handleDelete(client, sql, params) {
  const tableMatch = sql.match(/delete\s+from\s+(\w+)\s+where\s+(.+)/i);
  if (!tableMatch) throw new Error('Could not parse DELETE statement');
  
  const tableName = tableMatch[1];
  const whereClause = tableMatch[2];
  
  let query = client.from(tableName).delete();
  
  const whereMatches = whereClause.matchAll(/(\w+)\s*=\s*\?/g);
  let paramIndex = 0;
  for (const match of whereMatches) {
    query = query.eq(match[1], params[paramIndex++]);
  }
  
  const { error, count } = await query;
  if (error) throw error;
  
  return [{ affectedRows: count || 1 }];
}

module.exports = { getSupabase, query };
