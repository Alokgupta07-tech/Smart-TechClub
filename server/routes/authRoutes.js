const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');
const authMiddleware = require('../middleware/auth');
const { authLimiter, strictLimiter } = require('../middleware/rateLimiter');

/**
 * AUTHENTICATION ROUTES
 * All auth-related endpoints
 */

// Public routes (no auth required)
router.post('/register', authLimiter, authController.register);
router.post('/verify-email', authLimiter, authController.verifyEmail);
router.post('/resend-otp', authLimiter, authController.resendOTP);
router.post('/login', authLimiter, authController.login);
router.post('/verify-2fa', authLimiter, authController.verify2FA);
router.post('/refresh', authController.refresh);
router.post('/forgot-password', strictLimiter, authController.forgotPassword);
router.post('/reset-password', strictLimiter, authController.resetPassword);

// Protected routes (auth required)
router.post('/logout', authMiddleware, authController.logout);

module.exports = router;
