/**
 * Supabase Database Adapter
 * 
 * Provides a MySQL-like query interface for Supabase
 * This allows minimal changes to existing controllers
 */

const { supabaseAdmin } = require('./supabase');

/**
 * Execute a query using Supabase
 * Converts MySQL-style queries to Supabase operations
 * 
 * @param {string} sql - SQL query string (for compatibility)
 * @param {array} params - Query parameters
 * @returns {Promise<[array, any]>} - Returns [rows, metadata] like mysql2
 */
async function query(sql, params = []) {
  // Parse the SQL to determine operation
  const trimmedSql = sql.trim().toUpperCase();
  
  if (trimmedSql.startsWith('SELECT')) {
    return await executeSelect(sql, params);
  } else if (trimmedSql.startsWith('INSERT')) {
    return await executeInsert(sql, params);
  } else if (trimmedSql.startsWith('UPDATE')) {
    return await executeUpdate(sql, params);
  } else if (trimmedSql.startsWith('DELETE')) {
    return await executeDelete(sql, params);
  } else {
    // For complex queries, use raw SQL via Supabase RPC
    console.warn('Complex SQL detected, using raw query:', sql.substring(0, 100));
    const { data, error } = await supabaseAdmin.rpc('execute_sql', { query: sql, params });
    if (error) throw error;
    return [data || [], null];
  }
}

/**
 * Execute SELECT query
 */
async function executeSelect(sql, params) {
  // Simple table extraction from SELECT ... FROM table_name [alias]
  const tableMatch = sql.match(/FROM\s+(\w+)(?:\s+(?:AS\s+)?(\w+))?/i);
  if (!tableMatch) {
    throw new Error('Could not parse table from SELECT query');
  }
  
  const tableName = tableMatch[1];
  
  // Parse select columns - check for aggregate functions
  const selectMatch = sql.match(/SELECT\s+(.+?)\s+FROM/is);
  let selectCols = '*';
  if (selectMatch) {
    const rawSelect = selectMatch[1].trim();
    if (rawSelect !== '*' && !rawSelect.includes('.*')) {
      // Check for aggregate functions
      if (/\b(SUM|COUNT|AVG|MIN|MAX)\s*\(/i.test(rawSelect)) {
        // For aggregates, we use Supabase select with aggregate notation
        // But PostgREST doesn't support aggregates easily, so we fetch all and compute in JS
        selectCols = '*';
      } else {
        // Strip table alias prefixes and extract column names
        const cols = rawSelect.split(',').map(c => {
          let col = c.trim();
          if (col.includes('.')) col = col.split('.').pop();
          return col;
        });
        selectCols = cols.join(',');
      }
    }
  }
  
  // Build Supabase query
  let query = supabaseAdmin.from(tableName).select(selectCols);
  
  // Parse WHERE clause - use 's' flag for multi-line
  const whereMatch = sql.match(/WHERE\s+(.+?)(?:ORDER|LIMIT|GROUP|$)/is);
  if (whereMatch) {
    const conditions = parseWhereClause(whereMatch[1], params);
    conditions.forEach(cond => {
      query = applyCondition(query, cond);
    });
  }
  
  // Parse ORDER BY - handle table.column format
  const orderMatch = sql.match(/ORDER BY\s+([\w.]+)\s*(ASC|DESC)?/i);
  if (orderMatch) {
    let column = orderMatch[1];
    // Strip table alias prefix
    if (column.includes('.')) column = column.split('.').pop();
    const ascending = !orderMatch[2] || orderMatch[2].toUpperCase() === 'ASC';
    query = query.order(column, { ascending });
  }
  
  // Parse LIMIT
  const limitMatch = sql.match(/LIMIT\s+(\d+)/i);
  if (limitMatch) {
    query = query.limit(parseInt(limitMatch[1]));
  }
  
  const { data, error } = await query;
  if (error) throw error;
  
  // Handle aggregate functions in JS
  if (selectMatch) {
    const rawSelect = selectMatch[1].trim();
    const sumMatch = rawSelect.match(/SUM\((\w+)\)\s+(?:AS\s+)?(\w+)/i);
    if (sumMatch) {
      const col = sumMatch[1];
      const alias = sumMatch[2] || 'total';
      const total = (data || []).reduce((sum, row) => sum + (parseFloat(row[col]) || 0), 0);
      return [[{ [alias]: total }], null];
    }
    const countMatch = rawSelect.match(/COUNT\(\*?\)\s+(?:AS\s+)?(\w+)/i);
    if (countMatch) {
      const alias = countMatch[1] || 'count';
      return [[{ [alias]: (data || []).length }], null];
    }
  }
  
  return [data || [], null];
}

/**
 * Execute INSERT query
 */
async function executeInsert(sql, params) {
  // Parse INSERT INTO table_name (columns) VALUES (...)
  const tableMatch = sql.match(/INSERT\s+INTO\s+(\w+)/i);
  if (!tableMatch) {
    throw new Error('Could not parse table from INSERT query');
  }
  
  const tableName = tableMatch[1];
  
  // Parse column names
  const columnsMatch = sql.match(/\(([^)]+)\)\s*VALUES/i);
  if (!columnsMatch) {
    throw new Error('Could not parse columns from INSERT query');
  }
  
  const columns = columnsMatch[1].split(',').map(c => c.trim());
  
  // Parse VALUES clause to handle mix of ? params and literals
  const valuesMatch = sql.match(/VALUES\s*\(([^)]+)\)/i);
  if (!valuesMatch) {
    throw new Error('Could not parse VALUES from INSERT query');
  }
  
  const valueParts = valuesMatch[1].split(',').map(v => v.trim());
  const insertData = {};
  let paramIndex = 0;
  
  columns.forEach((col, i) => {
    const valuePart = valueParts[i];
    if (!valuePart) return;
    
    if (valuePart === '?') {
      // Parameterized value
      insertData[col] = params[paramIndex++];
    } else if (/^NULL$/i.test(valuePart)) {
      insertData[col] = null;
    } else if (/^'([^']*)'$/.test(valuePart)) {
      // String literal like 'IN_PROGRESS'
      insertData[col] = valuePart.slice(1, -1);
    } else if (/^(true|false)$/i.test(valuePart)) {
      insertData[col] = valuePart.toLowerCase() === 'true';
    } else if (/^-?\d+(\.\d+)?$/.test(valuePart)) {
      insertData[col] = parseFloat(valuePart);
    } else if (/^NOW\(\)$/i.test(valuePart)) {
      insertData[col] = new Date().toISOString();
    } else if (/^uuid_generate_v4\(\)$/i.test(valuePart)) {
      insertData[col] = require('uuid').v4();
    } else {
      // Unknown expression, try to use as param
      insertData[col] = params[paramIndex++];
    }
  });
  
  const { data, error } = await supabaseAdmin
    .from(tableName)
    .insert(insertData)
    .select();
  
  if (error) throw error;
  
  return [data || [], { insertId: data?.[0]?.id, affectedRows: data?.length || 0 }];
}

/**
 * Execute UPDATE query
 */
async function executeUpdate(sql, params) {
  const tableMatch = sql.match(/UPDATE\s+(\w+)/i);
  if (!tableMatch) {
    throw new Error('Could not parse table from UPDATE query');
  }
  
  const tableName = tableMatch[1];
  
  // Parse SET clause - use 's' flag for dotAll (multi-line SQL)
  const setMatch = sql.match(/SET\s+(.+?)\s+WHERE/is);
  if (!setMatch) {
    throw new Error('UPDATE without WHERE clause not supported for safety');
  }
  
  // Parse column=value pairs from SET clause
  const setParts = setMatch[1].split(',');
  const updateData = {};
  let paramIndex = 0;
  
  setParts.forEach(part => {
    const trimmedPart = part.trim();
    // Extract column name (handle table.column prefix)
    const eqIndex = trimmedPart.indexOf('=');
    if (eqIndex === -1) return;
    let col = trimmedPart.substring(0, eqIndex).trim();
    // Strip table alias prefix (e.g., "tqp.status" -> "status")
    if (col.includes('.')) col = col.split('.').pop();
    const valueExpr = trimmedPart.substring(eqIndex + 1).trim();
    
    if (valueExpr === '?' || (valueExpr.includes('?') && !valueExpr.match(/COALESCE/i))) {
      updateData[col] = params[paramIndex++];
    } else if (/^NOW\(\)$/i.test(valueExpr)) {
      updateData[col] = new Date().toISOString();
    } else if (/^NULL$/i.test(valueExpr)) {
      updateData[col] = null;
    } else if (/^'[^']*'$/.test(valueExpr)) {
      // String literal like 'skipped' or 'active'
      updateData[col] = valueExpr.slice(1, -1);
    } else if (/^(true|false)$/i.test(valueExpr)) {
      updateData[col] = valueExpr.toLowerCase() === 'true';
    } else if (/^-?\d+(\.\d+)?$/.test(valueExpr)) {
      updateData[col] = parseFloat(valueExpr);
    } else if (/COALESCE/i.test(valueExpr) && valueExpr.includes('?')) {
      // COALESCE(col, 0) + ? → use the param value
      updateData[col] = params[paramIndex++];
    }
    // Skip expressions we can't handle (COALESCE without ?, complex arithmetic)
  });
  
  // Parse WHERE clause - use 's' flag for dotAll
  const whereMatch = sql.match(/WHERE\s+(.+?)$/is);
  let query = supabaseAdmin.from(tableName).update(updateData);
  
  if (whereMatch) {
    const remainingParams = params.slice(paramIndex);
    const conditions = parseWhereClause(whereMatch[1], remainingParams);
    conditions.forEach(cond => {
      query = applyCondition(query, cond);
    });
  }
  
  const { data, error } = await query.select();
  if (error) throw error;
  
  return [data || [], { affectedRows: data?.length || 0, changedRows: data?.length || 0 }];
}

/**
 * Execute DELETE query
 */
async function executeDelete(sql, params) {
  const tableMatch = sql.match(/DELETE\s+FROM\s+(\w+)/i);
  if (!tableMatch) {
    throw new Error('Could not parse table from DELETE query');
  }
  
  const tableName = tableMatch[1];
  
  const whereMatch = sql.match(/WHERE\s+(.+?)$/i);
  let query = supabaseAdmin.from(tableName).delete();
  
  if (whereMatch && params.length > 0) {
    const conditions = parseWhereClause(whereMatch[1], params);
    conditions.forEach(cond => {
      query = applyCondition(query, cond);
    });
  }
  
  const { data, error } = await query.select();
  if (error) throw error;
  
  return [data || [], { affectedRows: data?.length || 0 }];
}

/**
 * Parse WHERE clause into conditions
 */
function parseWhereClause(whereStr, params) {
  const conditions = [];
  let paramIndex = 0;
  
  // Simple parsing - split by AND
  const parts = whereStr.split(/\bAND\b/i);
  
  parts.forEach(part => {
    let trimmed = part.trim();
    // Strip trailing ORDER BY, LIMIT, GROUP BY
    trimmed = trimmed.replace(/\s+(ORDER|LIMIT|GROUP)\s+.*/is, '');
    // Strip table alias prefix (e.g., "tqp.team_id" -> "team_id")
    trimmed = trimmed.replace(/(\w+)\.(\w+)/g, '$2');
    
    // Match column IS NULL
    const isNullMatch = trimmed.match(/(\w+)\s+IS\s+NULL/i);
    if (isNullMatch) {
      conditions.push({
        column: isNullMatch[1],
        operator: 'is',
        value: null
      });
      return;
    }
    
    // Match column IS NOT NULL
    const isNotNullMatch = trimmed.match(/(\w+)\s+IS\s+NOT\s+NULL/i);
    if (isNotNullMatch) {
      conditions.push({
        column: isNotNullMatch[1],
        operator: 'not.is',
        value: null
      });
      return;
    }
    
    // Match column != ? or column <> ?
    const neqMatch = trimmed.match(/(\w+)\s*(?:!=|<>)\s*\?/);
    if (neqMatch) {
      conditions.push({
        column: neqMatch[1],
        operator: 'neq',
        value: params[paramIndex++]
      });
      return;
    }
    
    // Match column = ?
    const eqMatch = trimmed.match(/(\w+)\s*=\s*\?/);
    if (eqMatch) {
      conditions.push({
        column: eqMatch[1],
        operator: 'eq',
        value: params[paramIndex++]
      });
      return;
    }
    
    // Match column = true/false
    const boolMatch = trimmed.match(/(\w+)\s*=\s*(true|false)/i);
    if (boolMatch) {
      conditions.push({
        column: boolMatch[1],
        operator: 'eq',
        value: boolMatch[2].toLowerCase() === 'true'
      });
      return;
    }
    
    // Match column != 'literal' or column <> 'literal'
    const neqStrLitMatch = trimmed.match(/(\w+)\s*(?:!=|<>)\s*'([^']*)'/);
    if (neqStrLitMatch) {
      conditions.push({
        column: neqStrLitMatch[1],
        operator: 'neq',
        value: neqStrLitMatch[2]
      });
      return;
    }
    
    // Match column = 'literal'
    const strLitMatch = trimmed.match(/(\w+)\s*=\s*'([^']*)'/);
    if (strLitMatch) {
      conditions.push({
        column: strLitMatch[1],
        operator: 'eq',
        value: strLitMatch[2]
      });
      return;
    }
    
    // Match column = number
    const numLitMatch = trimmed.match(/(\w+)\s*=\s*(-?\d+(?:\.\d+)?)/);
    if (numLitMatch) {
      conditions.push({
        column: numLitMatch[1],
        operator: 'eq',
        value: parseFloat(numLitMatch[2])
      });
      return;
    }
    
    // Match column LIKE ?
    const likeMatch = trimmed.match(/(\w+)\s+LIKE\s+\?/i);
    if (likeMatch) {
      conditions.push({
        column: likeMatch[1],
        operator: 'ilike',
        value: params[paramIndex++]
      });
      return;
    }
    
    // Match column > ?
    const gtMatch = trimmed.match(/(\w+)\s*>\s*\?/);
    if (gtMatch) {
      conditions.push({
        column: gtMatch[1],
        operator: 'gt',
        value: params[paramIndex++]
      });
      return;
    }
    
    // Match column < ?
    const ltMatch = trimmed.match(/(\w+)\s*<\s*\?/);
    if (ltMatch) {
      conditions.push({
        column: ltMatch[1],
        operator: 'lt',
        value: params[paramIndex++]
      });
      return;
    }
    
    // Match column IN (?, ?, ?)
    const inMatch = trimmed.match(/(\w+)\s+IN\s*\(([^)]+)\)/i);
    if (inMatch) {
      const questionMarks = inMatch[2].match(/\?/g)?.length || 0;
      const values = params.slice(paramIndex, paramIndex + questionMarks);
      paramIndex += questionMarks;
      conditions.push({
        column: inMatch[1],
        operator: 'in',
        value: values
      });
      return;
    }
  });
  
  return conditions;
}

/**
 * Apply condition to Supabase query
 */
function applyCondition(query, condition) {
  switch (condition.operator) {
    case 'eq':
      return query.eq(condition.column, condition.value);
    case 'neq':
      return query.neq(condition.column, condition.value);
    case 'gt':
      return query.gt(condition.column, condition.value);
    case 'gte':
      return query.gte(condition.column, condition.value);
    case 'lt':
      return query.lt(condition.column, condition.value);
    case 'lte':
      return query.lte(condition.column, condition.value);
    case 'like':
    case 'ilike':
      return query.ilike(condition.column, condition.value);
    case 'in':
      return query.in(condition.column, condition.value);
    case 'is':
      return query.is(condition.column, condition.value);
    case 'not.is':
      return query.not(condition.column, 'is', condition.value);
    default:
      return query;
  }
}

/**
 * Get a connection (for compatibility - just returns the pool/adapter)
 * Includes no-op transaction methods for MySQL compatibility
 */
function getConnection() {
  return Promise.resolve({
    query: query,
    release: () => {},
    execute: query,
    beginTransaction: () => Promise.resolve(),
    commit: () => Promise.resolve(),
    rollback: () => Promise.resolve()
  });
}

// Export query function directly (mysql2 style)
module.exports = {
  query,
  getConnection,
  execute: query
};
