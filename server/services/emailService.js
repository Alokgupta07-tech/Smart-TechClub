const transporter = require('../config/email');

/**
 * Email Service
 * Sends OTP and notification emails
 */

const FROM_EMAIL = process.env.EMAIL_FROM || 'noreply@lockdownhq.com';
const APP_NAME = 'Lockdown HQ';

/**
 * Send verification email
 * @param {String} email
 * @param {String} name
 * @param {String} otp
 */
async function sendVerificationEmail(email, name, otp) {
  const subject = `${APP_NAME} - Verify Your Email`;
  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <h2 style="color: #00ff00;">Email Verification</h2>
      <p>Hello ${name},</p>
      <p>Thank you for registering with ${APP_NAME}. Use the code below to verify your email:</p>
      <div style="background: #000; color: #00ff00; padding: 20px; text-align: center; font-size: 32px; font-weight: bold; letter-spacing: 5px; border: 2px solid #00ff00; margin: 20px 0;">
        ${otp}
      </div>
      <p>This code expires in <strong>10 minutes</strong>.</p>
      <p>If you didn't request this, please ignore this email.</p>
      <hr style="border: 1px solid #333; margin: 20px 0;">
      <p style="color: #666; font-size: 12px;">${APP_NAME} Security Team</p>
    </div>
  `;

  if (transporter) {
    await transporter.sendMail({
      from: FROM_EMAIL,
      to: email,
      subject,
      html
    });
  } else {
    console.log(`[EMAIL] OTP for ${email} (${subject}): ${otp}`);
  }
}

/**
 * Send 2FA code
 * @param {String} email
 * @param {String} name
 * @param {String} otp
 */
async function send2FACode(email, name, otp) {
  const subject = `${APP_NAME} - Two-Factor Authentication`;
  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <h2 style="color: #00ff00;">Two-Factor Authentication</h2>
      <p>Hello ${name},</p>
      <p>Your login requires 2FA verification. Use this code:</p>
      <div style="background: #000; color: #00ff00; padding: 20px; text-align: center; font-size: 32px; font-weight: bold; letter-spacing: 5px; border: 2px solid #00ff00; margin: 20px 0;">
        ${otp}
      </div>
      <p>This code expires in <strong>10 minutes</strong>.</p>
      <p>If you didn't attempt to login, your account may be compromised.</p>
      <hr style="border: 1px solid #333; margin: 20px 0;">
      <p style="color: #666; font-size: 12px;">${APP_NAME} Security Team</p>
    </div>
  `;

  if (transporter) {
    await transporter.sendMail({
      from: FROM_EMAIL,
      to: email,
      subject,
      html
    });
  } else {
    console.log(`[EMAIL] OTP for ${email} (${subject}): ${otp}`);
  }
}

/**
 * Send password reset email
 * @param {String} email
 * @param {String} name
 * @param {String} otp
 */
async function sendPasswordResetEmail(email, name, otp) {
  const subject = `${APP_NAME} - Password Reset`;
  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <h2 style="color: #ff0000;">Password Reset Request</h2>
      <p>Hello ${name},</p>
      <p>You requested to reset your password. Use this code:</p>
      <div style="background: #000; color: #ff0000; padding: 20px; text-align: center; font-size: 32px; font-weight: bold; letter-spacing: 5px; border: 2px solid #ff0000; margin: 20px 0;">
        ${otp}
      </div>
      <p>This code expires in <strong>10 minutes</strong>.</p>
      <p><strong>If you didn't request this, ignore this email and your password will remain unchanged.</strong></p>
      <hr style="border: 1px solid #333; margin: 20px 0;">
      <p style="color: #666; font-size: 12px;">${APP_NAME} Security Team</p>
    </div>
  `;

  if (transporter) {
    await transporter.sendMail({
      from: FROM_EMAIL,
      to: email,
      subject,
      html
    });
  } else {
    console.log(`[EMAIL] OTP for ${email} (${subject}): ${otp}`);
  }
}

module.exports = {
  sendVerificationEmail,
  send2FACode,
  sendPasswordResetEmail
};
