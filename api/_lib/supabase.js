const { createClient } = require('@supabase/supabase-js');
const { v4: uuidv4 } = require('uuid');

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
      auth: { autoRefreshToken: false, persistSession: false }
    });
  }
  return supabase;
}

// ========== Helpers ==========

function applyWhere(query, whereStr, params, startIdx) {
  let pi = startIdx || 0;
  const parts = whereStr.split(/\s+and\s+/i);

  for (const cond of parts) {
    const t = cond.trim();

    // IN ('a','b') or IN (?,?)
    const inM = t.match(/(?:\w+\.)?(\w+)\s+IN\s*\(([^)]+)\)/i);
    if (inM) {
      const vals = inM[2].split(',').map(v => {
        v = v.trim();
        if (v === '?') return params[pi++];
        return v.replace(/^'|'$/g, '');
      });
      query = query.in(inM[1], vals);
      continue;
    }

    // col != 'value'
    const neqStr = t.match(/(?:\w+\.)?(\w+)\s*!=\s*'([^']*)'/);
    if (neqStr) { query = query.neq(neqStr[1], neqStr[2]); continue; }

    // col = 'value'
    const eqStr = t.match(/(?:\w+\.)?(\w+)\s*=\s*'([^']*)'/);
    if (eqStr) { query = query.eq(eqStr[1], eqStr[2]); continue; }

    // comparison with NOW()
    const nowM = t.match(/(?:\w+\.)?(\w+)\s*(>=|<=|!=|<>|>|<|=)\s*NOW\(\)/i);
    if (nowM) {
      const now = new Date().toISOString();
      const op = nowM[2];
      if (op === '>') query = query.gt(nowM[1], now);
      else if (op === '>=') query = query.gte(nowM[1], now);
      else if (op === '<') query = query.lt(nowM[1], now);
      else if (op === '<=') query = query.lte(nowM[1], now);
      else query = query.eq(nowM[1], now);
      continue;
    }

    // comparison with ? param
    const cmpM = t.match(/(?:\w+\.)?(\w+)\s*(>=|<=|!=|<>|>|<|=)\s*\?/);
    if (cmpM) {
      const col = cmpM[1], op = cmpM[2], val = params[pi++];
      if (op === '=') query = query.eq(col, val);
      else if (op === '!=' || op === '<>') query = query.neq(col, val);
      else if (op === '>') query = query.gt(col, val);
      else if (op === '>=') query = query.gte(col, val);
      else if (op === '<') query = query.lt(col, val);
      else if (op === '<=') query = query.lte(col, val);
      continue;
    }

    // IS NULL / IS NOT NULL
    const nullM = t.match(/(?:\w+\.)?(\w+)\s+is\s+(not\s+)?null/i);
    if (nullM) {
      if (nullM[2]) query = query.not(nullM[1], 'is', null);
      else query = query.is(nullM[1], null);
      continue;
    }
  }
  return { query, paramIndex: pi };
}

function applyOrderBy(query, sql) {
  const m = sql.match(/order\s+by\s+(.+?)(?:\s+limit|\s*$)/i);
  if (m) {
    for (const part of m[1].split(',')) {
      const p = part.trim().match(/(?:\w+\.)?(\w+)(?:\s+(asc|desc))?/i);
      if (p) query = query.order(p[1], { ascending: !p[2] || p[2].toLowerCase() === 'asc' });
    }
  }
  return query;
}

function applyLimit(query, sql) {
  const m = sql.match(/limit\s+(\d+)/i);
  if (m) query = query.limit(parseInt(m[1]));
  return query;
}

// ========== Query Router ==========

async function query(sql, params = []) {
  const client = getSupabase();
  const t = sql.trim().toLowerCase();
  if (t.startsWith('select')) return handleSelect(client, sql, params);
  if (t.startsWith('insert')) return handleInsert(client, sql, params);
  if (t.startsWith('update')) return handleUpdate(client, sql, params);
  if (t.startsWith('delete')) return handleDelete(client, sql, params);
  throw new Error('Unsupported query type: ' + sql.substring(0, 40));
}

// ========== SELECT ==========

async function handleSelect(client, sql, params) {
  // SELECT 1 health check
  if (sql.match(/select\s+1\b/i)) return [[{ test: 1 }]];

  // COUNT(*) queries
  const countM = sql.match(/select\s+count\(\*?\)\s+as\s+(\w+)\s+from\s+(\w+)/i);
  if (countM) {
    let q = client.from(countM[2]).select('id', { count: 'exact', head: true });
    const wm = sql.match(/where\s+(.+?)(?:\s+order|\s+limit|\s+group|\s*$)/i);
    if (wm) q = applyWhere(q, wm[1], params, 0).query;
    const { count, error } = await q;
    if (error) throw error;
    return [[{ [countM[1]]: count || 0 }]];
  }

  // Multi-aggregate: COUNT(*) + SUM(col)
  const multiAgg = sql.match(/select\s+count\(\*?\)\s+as\s+(\w+)\s*,\s*sum\((\w+)\)\s+as\s+(\w+)\s+from\s+(\w+)/i);
  if (multiAgg) {
    const [, countAlias, sumCol, sumAlias, table] = multiAgg;
    let q = client.from(table).select(sumCol);
    const wm = sql.match(/where\s+(.+?)(?:\s+order|\s+limit|\s+group|\s*$)/i);
    if (wm) q = applyWhere(q, wm[1], params, 0).query;
    const { data, error } = await q;
    if (error) throw error;
    const rows = data || [];
    const total = rows.length;
    const sum = rows.reduce((s, r) => s + (Number(r[sumCol]) || 0), 0);
    return [[{ [countAlias]: total, [sumAlias]: sum }]];
  }

  // JOIN queries
  const joinM = sql.match(/from\s+(\w+)\s+(\w+)\s+join\s+(\w+)\s+(\w+)\s+on\s+(\w+)\.(\w+)\s*=\s*(\w+)\.(\w+)/i);
  if (joinM) return handleJoinSelect(client, sql, params, joinM);

  // Standard SELECT
  const tableM = sql.match(/from\s+(\w+)/i);
  if (!tableM) throw new Error('Could not parse table name from SELECT');
  const tableName = tableM[1];

  // Parse columns
  const colsM = sql.match(/select\s+(.+?)\s+from/is);
  let selectCols = '*';
  if (colsM) {
    const c = colsM[1].trim();
    if (c !== '*') {
      if (c.match(/\w+\.\*/)) selectCols = '*';
      else {
        selectCols = c.split(',').map(col => {
          col = col.trim().replace(/\s+as\s+\w+/i, '').replace(/\w+\./g, '').trim();
          return col;
        }).filter(Boolean).join(',');
      }
    }
  }

  let q = client.from(tableName).select(selectCols);
  const wm = sql.match(/where\s+(.+?)(?:\s+order|\s+limit|\s+group|\s*$)/i);
  if (wm) q = applyWhere(q, wm[1], params, 0).query;
  q = applyOrderBy(q, sql);
  q = applyLimit(q, sql);

  const { data, error } = await q;
  if (error) throw error;
  return [data || []];
}

// ========== JOIN (decomposed into separate queries) ==========

async function handleJoinSelect(client, sql, params, jm) {
  // jm: [_, table1, alias1, table2, alias2, onAlias1, onCol1, onAlias2, onCol2]
  const table1 = jm[1], alias1 = jm[2];
  const table2 = jm[3], alias2 = jm[4];
  // Figure out which column belongs to which table
  const onLeftAlias = jm[5], onLeftCol = jm[6];
  const onRightAlias = jm[7], onRightCol = jm[8];

  // Determine join columns per table
  let t1JoinCol, t2JoinCol;
  if (onLeftAlias === alias1) {
    t1JoinCol = onLeftCol;  // e.g. user_id
    t2JoinCol = onRightCol; // e.g. id
  } else {
    t1JoinCol = onRightCol;
    t2JoinCol = onLeftCol;
  }

  // Query primary table
  let q1 = client.from(table1).select('*');
  const wm = sql.match(/where\s+(.+?)(?:\s+order|\s+limit|\s+group|\s*$)/i);
  if (wm) {
    let wStr = wm[1].replace(new RegExp(alias1 + '\\.', 'g'), '').replace(new RegExp(alias2 + '\\.', 'g'), '');
    q1 = applyWhere(q1, wStr, params, 0).query;
  }
  q1 = applyOrderBy(q1, sql);
  q1 = applyLimit(q1, sql);

  const { data: rows1, error: err1 } = await q1;
  if (err1) throw err1;
  if (!rows1 || rows1.length === 0) return [[]];

  // Query secondary table
  const joinVals = [...new Set(rows1.map(r => r[t1JoinCol]).filter(Boolean))];
  if (joinVals.length === 0) return [rows1];

  const { data: rows2, error: err2 } = await client.from(table2).select('*').in(t2JoinCol, joinVals);
  if (err2) throw err2;

  const lookup = {};
  for (const r of (rows2 || [])) lookup[r[t2JoinCol]] = r;

  // Parse column aliases from SELECT clause
  const aliasMap = {};
  const selPart = sql.match(/select\s+(.+?)\s+from/is);
  if (selPart) {
    for (const col of selPart[1].split(',')) {
      const am = col.trim().match(/(\w+)\.(\w+)\s+as\s+(\w+)/i);
      if (am && am[1] === alias2) {
        aliasMap[am[3]] = am[2]; // leader_name -> name
      }
    }
  }

  // Merge
  const merged = rows1.map(r1 => {
    const r2 = lookup[r1[t1JoinCol]] || {};
    const row = { ...r1 };
    for (const [alias, srcCol] of Object.entries(aliasMap)) {
      row[alias] = r2[srcCol] !== undefined ? r2[srcCol] : null;
    }
    return row;
  });

  return [merged];
}

// ========== INSERT ==========

async function handleInsert(client, sql, params) {
  const m = sql.match(/insert\s+into\s+(\w+)\s*\(([^)]+)\)/i);
  if (!m) throw new Error('Could not parse INSERT statement');

  const tableName = m[1];
  const columns = m[2].split(',').map(c => c.trim());
  const valuesM = sql.match(/values\s*\(([^)]+)\)/i);
  const vParts = valuesM ? valuesM[1].split(',').map(v => v.trim()) : [];

  const data = {};
  let pi = 0;
  columns.forEach((col, idx) => {
    const vp = vParts[idx];
    if (!vp || vp === '?') { data[col] = params[pi++]; }
    else if (/^NULL$/i.test(vp)) { data[col] = null; }
    else if (/^'([^']*)'$/.test(vp)) { data[col] = vp.slice(1, -1); }
    else if (/^(true|false)$/i.test(vp)) { data[col] = vp.toLowerCase() === 'true'; }
    else if (/^-?\d+(\.\d+)?$/.test(vp)) { data[col] = parseFloat(vp); }
    else if (/^NOW\(\)$/i.test(vp)) { data[col] = new Date().toISOString(); }
    else if (/^UUID\(\)$/i.test(vp)) { data[col] = uuidv4(); }
    else { data[col] = params[pi++]; }
  });

  const { data: result, error } = await client.from(tableName).insert(data).select();
  if (error) throw error;
  return [{ insertId: result?.[0]?.id, affectedRows: 1 }];
}

// ========== UPDATE (supports arithmetic: col = col + ?) ==========

async function handleUpdate(client, sql, params) {
  const hasWhere = /\bwhere\b/i.test(sql);
  const m = hasWhere
    ? sql.match(/update\s+(\w+)\s+set\s+(.+?)\s+where\s+(.+)/is)
    : sql.match(/update\s+(\w+)\s+set\s+(.+)/is);
  if (!m) throw new Error('Could not parse UPDATE statement');

  const tableName = m[1], setClause = m[2], whereClause = hasWhere ? m[3] : null;
  const updateData = {};
  const arithmeticOps = [];
  let pi = 0;

  for (const part of setClause.split(',')) {
    const tp = part.trim();

    // Arithmetic: col = col +/- ?|number
    const arith = tp.match(/(\w+)\s*=\s*\1\s*([+-])\s*(\?|\d+)/);
    if (arith) {
      const val = arith[3] === '?' ? params[pi++] : parseFloat(arith[3]);
      arithmeticOps.push({ col: arith[1], op: arith[2], val });
      continue;
    }
    // col = ?
    const pm = tp.match(/(\w+)\s*=\s*\?/);
    if (pm) { updateData[pm[1]] = params[pi++]; continue; }
    // col = NOW()
    const nm = tp.match(/(\w+)\s*=\s*NOW\(\)/i);
    if (nm) { updateData[nm[1]] = new Date().toISOString(); continue; }
    // col = NULL
    const nlm = tp.match(/(\w+)\s*=\s*NULL\b/i);
    if (nlm) { updateData[nlm[1]] = null; continue; }
    // col = 'string'
    const sm = tp.match(/(\w+)\s*=\s*'([^']*)'/);
    if (sm) { updateData[sm[1]] = sm[2]; continue; }
    // col = number
    const num = tp.match(/(\w+)\s*=\s*(-?\d+(?:\.\d+)?)\s*$/);
    if (num) { updateData[num[1]] = parseFloat(num[2]); continue; }
    // col = bool
    const bm = tp.match(/(\w+)\s*=\s*(true|false)\b/i);
    if (bm) { updateData[bm[1]] = bm[2].toLowerCase() === 'true'; continue; }
  }

  if (arithmeticOps.length > 0) {
    // Need to SELECT current values first, then compute and update
    const selectCols = [...new Set(arithmeticOps.map(a => a.col))].join(',');
    let selQ = client.from(tableName).select(selectCols + ',id');
    if (whereClause) selQ = applyWhere(selQ, whereClause, params, pi).query;
    const { data: rows, error: selErr } = await selQ;
    if (selErr) throw selErr;
    if (!rows || rows.length === 0) return [{ affectedRows: 0 }];

    for (const row of rows) {
      const rowData = { ...updateData };
      for (const a of arithmeticOps) {
        rowData[a.col] = (row[a.col] || 0) + (a.op === '+' ? a.val : -a.val);
      }
      let uq = client.from(tableName).update(rowData);
      if (row.id) uq = uq.eq('id', row.id);
      else if (whereClause) uq = applyWhere(uq, whereClause, params, pi).query;
      const { error: upErr } = await uq;
      if (upErr) throw upErr;
    }
    return [{ affectedRows: rows.length }];
  }

  // Simple update
  let q = client.from(tableName).update(updateData);
  if (whereClause) q = applyWhere(q, whereClause, params, pi).query;
  const { error, count } = await q;
  if (error) throw error;
  return [{ affectedRows: count || 1 }];
}

// ========== DELETE ==========

async function handleDelete(client, sql, params) {
  const m = sql.match(/delete\s+from\s+(\w+)(?:\s+where\s+(.+))?/i);
  if (!m) throw new Error('Could not parse DELETE statement');

  let q = client.from(m[1]).delete();
  if (m[2]) q = applyWhere(q, m[2], params, 0).query;

  const { error, count } = await q;
  if (error) throw error;
  return [{ affectedRows: count || 1 }];
}

module.exports = { getSupabase, query };
