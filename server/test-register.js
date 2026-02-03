/**
 * Test script to register a test team
 */
const axios = require('axios');

const API_URL = 'http://localhost:5000/api';

async function testRegister() {
  try {
    console.log('\n=== TESTING TEAM REGISTRATION ===\n');
    
    // Register
    const registerPayload = {
      name: 'Test Leader',
      email: `test${Date.now()}@example.com`,
      password: 'test1234',
      teamName: 'Test Team'
    };
    
    console.log('📝 Registering team:', registerPayload.teamName);
    console.log('   Email:', registerPayload.email);
    
    const registerResponse = await axios.post(`${API_URL}/auth/register`, registerPayload);
    console.log('✅ Registration successful!');
    console.log('   User ID:', registerResponse.data.userId);
    
    const userId = registerResponse.data.userId;
    
    // Note: In real scenario, OTP would be sent to email
    // For testing, we'll check console logs
    console.log('\n⚠️  Check server console for OTP code');
    console.log('   Then use this userId for verification:', userId);
    
    return { userId, email: registerPayload.email };
    
  } catch (error) {
    console.error('❌ Error:', error.response?.data || error.message);
  }
}

testRegister();
