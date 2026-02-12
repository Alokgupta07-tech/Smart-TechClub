// Handle /api/puzzles base path (no subpath)
// Delegate to the catch-all handler
module.exports = require('./puzzles/[...path]');
