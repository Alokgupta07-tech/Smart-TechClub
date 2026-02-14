const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
const hpp = require('hpp');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });

// Import security utilities
const { sanitizeBody, validateInputs } = require('./utils/sanitize');

// Import routes
const authRoutes = require('./routes/authRoutes');
const adminRoutes = require('./routes/adminRoutes');
const teamRoutes = require('./routes/teamRoutes');
const puzzleRoutes = require('./routes/puzzleRoutes');
const gameRoutes = require('./routes/gameRoutes');
const gameplayRoutes = require('./routes/gameplayRoutes');
const featureRoutes = require('./routes/featureRoutes');
const timeTrackingRoutes = require('./routes/timeTrackingRoutes');
const qualificationRoutes = require('./routes/qualificationRoutes'); // NEW: Level qualification system
const evaluationRoutes = require('./routes/evaluationRoutes'); // NEW: Admin-controlled evaluation system

// Import database (this tests connection)
require('./config/db');
const { ensureAdminUser } = require('./services/adminSeedService');

const app = express();
const PORT = process.env.PORT || 5000;

// ============================================
// SECURITY MIDDLEWARE
// ============================================

// Helmet - Security headers
app.use(helmet());

// Compression - Reduce response size for faster transfers
app.use(compression({
  level: 6, // Balanced compression level
  threshold: 1024, // Only compress responses > 1KB
  filter: (req, res) => {
    if (req.headers['x-no-compression']) return false;
    return compression.filter(req, res);
  }
}));

// CORS - Allow frontend access
const allowedOrigins = [
  process.env.FRONTEND_URL,
  'http://localhost:5173',
  'http://localhost:8080'
].filter(Boolean);

app.use(cors({
  origin: (origin, callback) => {
    if (!origin || allowedOrigins.includes(origin)) {
      return callback(null, true);
    }
    return callback(new Error('Not allowed by CORS'));
  },
  credentials: true
}));

// Body parser
app.use(express.json({ limit: '10kb' })); // Limit body size
app.use(express.urlencoded({ extended: true, limit: '10kb' }));

// HTTP Parameter Pollution protection
app.use(hpp());

// Input sanitization and validation
app.use(sanitizeBody);
app.use(validateInputs);

// Request logging (development only)
if (process.env.NODE_ENV === 'development') {
  app.use((req, res, next) => {
    console.log(`${req.method} ${req.path}`);
    next();
  });
}

// ============================================
// ROUTES
// ============================================

app.get('/', (req, res) => {
  res.json({
    message: '🔐 Lockdown HQ - Enterprise Auth API',
    version: '1.0.0',
    status: 'online',
    endpoints: {
      auth: '/api/auth',
      admin: '/api/admin',
      team: '/api/team',
      puzzles: '/api/puzzles',
      game: '/api/game',
      gameplay: '/api/gameplay'
    }
  });
});

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({
    status: 'healthy',
    message: 'Backend API is running successfully',
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || 'development'
  });
});

app.use('/api/auth', authRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/admin/evaluation', evaluationRoutes);  // NEW: Admin evaluation routes
app.use('/api/team', teamRoutes);
app.use('/api/puzzles', puzzleRoutes);
app.use('/api/game', gameRoutes);
app.use('/api/game/time', timeTrackingRoutes);  // Time tracking routes
app.use('/api/gameplay', gameplayRoutes);
app.use('/api', featureRoutes);
app.use('/api', qualificationRoutes);  // NEW: Level qualification routes

// 404 handler
app.use((req, res) => {
  res.status(404).json({ error: 'Endpoint not found' });
});

// Global error handler
app.use((err, req, res, next) => {
  console.error('Server error:', err);
  res.status(500).json({ 
    error: 'Internal server error',
    message: process.env.NODE_ENV === 'development' ? err.message : undefined
  });
});

// ============================================
// START SERVER
// ============================================

app.listen(PORT, async () => {
  console.log('\n🚀 ============================================');
  console.log(`   Lockdown HQ - Auth Server`);
  console.log('   ============================================');
  console.log(`   🌐 Server running on port ${PORT}`);
  console.log(`   📍 Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`   🔗 API: http://localhost:${PORT}`);
  console.log('   ============================================\n');

  await ensureAdminUser();
});

module.exports = app;
