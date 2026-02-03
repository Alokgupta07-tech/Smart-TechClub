/**
 * Test script to login and fetch team data
 */
const axios = require('axios');

const API_URL = 'http://localhost:5000/api';

// Use credentials from last registration
const email = process.argv[2] || 'test1770103842699@example.com';
const password = process.argv[3] || 'test1234';

async function testTeamData() {
  try {
    console.log('\n=== TESTING TEAM DATA FETCH ===\n');
    
    // Login
    console.log('📝 Logging in as:', email);
    const loginResponse = await axios.post(`${API_URL}/auth/login`, {
      email,
      password
    });
    
    console.log('✅ Login successful!');
    const accessToken = loginResponse.data.accessToken;
    console.log('   Access Token:', accessToken.substring(0, 20) + '...');
    console.log('   Role:', loginResponse.data.role);
    
    // Fetch team data
    console.log('\n📊 Fetching team data...');
    const teamResponse = await axios.get(`${API_URL}/team/me`, {
      headers: {
        Authorization: `Bearer ${accessToken}`
      }
    });
    
    console.log('✅ Team data retrieved!');
    console.log('\n📋 Team Details:');
    console.log('   ID:', teamResponse.data.id);
    console.log('   Team Name:', teamResponse.data.teamName);
    console.log('   Level:', teamResponse.data.level);
    console.log('   Status:', teamResponse.data.status);
    console.log('   Progress:', teamResponse.data.progress);
    console.log('   Hints Used:', teamResponse.data.hintsUsed);
    console.log('   Created:', new Date(teamResponse.data.createdAt).toLocaleString());
    
  } catch (error) {
    console.error('❌ Error:', error.response?.data || error.message);
  }
}

testTeamData();
