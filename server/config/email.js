const nodemailer = require('nodemailer');
require('dotenv').config();

/**
 * Nodemailer Configuration
 * Used for sending OTP emails
 */

// Create transporter only if email credentials are provided
let transporter = null;

if (process.env.EMAIL_USER && process.env.EMAIL_PASSWORD) {
  transporter = nodemailer.createTransport({
    host: process.env.EMAIL_HOST || 'smtp.gmail.com',
    port: process.env.EMAIL_PORT || 587,
    secure: process.env.EMAIL_SECURE === 'true',
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASSWORD
    }
  });

  // Verify email configuration on startup
  transporter.verify((error, success) => {
    if (error) {
      console.warn('⚠️  Email service error:', error.message);
    } else {
      console.log('✅ Email service ready');
    }
  });
} else {
  console.warn('⚠️  Email service not configured (EMAIL_USER/EMAIL_PASSWORD missing)');
  console.warn('   OTP emails will be logged to console instead');
}

module.exports = transporter;
