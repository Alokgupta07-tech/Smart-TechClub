/**
 * Test script to verify the email verification endpoint works
 */
const axios = require('axios');

const API_URL = 'http://localhost:5000/api';

// Get userId and OTP from command line or use defaults for testing
const userId = process.argv[2];
const otp = process.argv[3];

if (!userId || !otp) {
  console.log('Usage: node test-verify-endpoint.js <userId> <otp>');
  console.log('\nExample: node test-verify-endpoint.js e81f0e9f-xxx-xxx 477067');
  process.exit(1);
}

async function testVerifyEndpoint() {
  try {
    console.log('\n=== TESTING EMAIL VERIFICATION ENDPOINT ===\n');
    console.log('User ID:', userId);
    console.log('OTP:', otp);
    console.log('API URL:', `${API_URL}/auth/verify-email`);
    
    const response = await axios.post(`${API_URL}/auth/verify-email`, {
      userId,
      otp
    });
    
    console.log('\n✅ Verification successful!');
    console.log('Response:', response.data);
    
  } catch (error) {
    console.error('\n❌ Verification failed!');
    if (error.response) {
      console.error('Status:', error.response.status);
      console.error('Error:', error.response.data);
    } else {
      console.error('Error:', error.message);
    }
  }
}

testVerifyEndpoint();
