module.exports = (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  const results = {};

  try {
    require('./_lib/supabase');
    results.supabase = 'OK';
  } catch (e) {
    results.supabase = e.message;
  }

  try {
    require('./_lib/auth');
    results.auth = 'OK';
  } catch (e) {
    results.auth = e.message;
  }

  try {
    require('bcryptjs');
    results.bcryptjs = 'OK';
  } catch (e) {
    results.bcryptjs = e.message;
  }

  try {
    require('uuid');
    results.uuid = 'OK';
  } catch (e) {
    results.uuid = e.message;
  }

  try {
    require('jsonwebtoken');
    results.jsonwebtoken = 'OK';
  } catch (e) {
    results.jsonwebtoken = e.message;
  }

  try {
    require('@supabase/supabase-js');
    results.supabasejs = 'OK';
  } catch (e) {
    results.supabasejs = e.message;
  }

  res.json(results);
};
