module.exports = (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.json({ ok: true, time: new Date().toISOString(), nodeVersion: process.version });
};
