const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
require('dotenv').config();

// Import routes
const authRoutes = require('./routes/authRoutes');
const adminRoutes = require('./routes/adminRoutes');
const teamRoutes = require('./routes/teamRoutes');
const puzzleRoutes = require('./routes/puzzleRoutes');
const gameRoutes = require('./routes/gameRoutes');
const gameplayRoutes = require('./routes/gameplayRoutes');
const featureRoutes = require('./routes/featureRoutes');

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
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

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

app.use('/api/auth', authRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/team', teamRoutes);
app.use('/api/puzzles', puzzleRoutes);
app.use('/api/game', gameRoutes);
app.use('/api/gameplay', gameplayRoutes);
app.use('/api', featureRoutes);

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
