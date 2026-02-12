module.exports = (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  const results = {};

  try {
    require('../_lib/supabase');
    results.supabase = 'OK';
  } catch (e) {
    results.supabase = e.message;
  }

  try {
    require('../_lib/auth');
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

  res.json(results);
};
