/**
 * Test script to verify email with OTP
 */
const axios = require('axios');

const API_URL = 'http://localhost:5000/api';

// Get OTP and userId from command line
const userId = process.argv[2];
const otp = process.argv[3];

if (!userId || !otp) {
  console.log('Usage: node test-verify.js <userId> <otp>');
  process.exit(1);
}

async function verifyEmail() {
  try {
    console.log('\n=== VERIFYING EMAIL ===\n');
    console.log('User ID:', userId);
    console.log('OTP:', otp);
    
    const response = await axios.post(`${API_URL}/auth/verify-email`, {
      userId,
      otp
    });
    
    console.log('✅ Email verified!');
    console.log('   Message:', response.data.message);
    console.log('\n✅ You can now login with your credentials');
    
  } catch (error) {
    console.error('❌ Error:', error.response?.data || error.message);
  }
}

verifyEmail();
