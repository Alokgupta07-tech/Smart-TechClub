/**
 * Get the latest OTP from database for testing
 */
const db = require('./config/db');

async function getLatestOTP() {
  try {
    const [rows] = await db.query(`
      SELECT user_id, otp, created_at 
      FROM email_otps 
      WHERE used = 0 
      ORDER BY created_at DESC 
      LIMIT 1
    `);
    
    if (rows.length > 0) {
      console.log('\n=== LATEST OTP ===\n');
      console.log('User ID:', rows[0].user_id);
      console.log('OTP Code:', rows[0].otp);
      console.log('Created:', new Date(rows[0].created_at).toLocaleString());
      console.log('\nRun: node test-verify.js', rows[0].user_id, rows[0].otp);
    } else {
      console.log('No pending email verifications found');
    }
    
    process.exit(0);
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

getLatestOTP();
