import axios from 'axios';
import dotenv from 'dotenv';

dotenv.config();

const PORTAINER_URL = process.env.PORTAINER_URL || 'http://192.168.50.78:9000';
const PORTAINER_TOKEN = process.env.PORTAINER_TOKEN;

async function testConnection() {
  console.log('Testing Portainer connection...');
  console.log(`URL: ${PORTAINER_URL}`);
  console.log(`Token: ${PORTAINER_TOKEN ? '✓ Set' : '✗ Not set'}`);
  
  if (!PORTAINER_TOKEN) {
    console.error('\n❌ PORTAINER_TOKEN not set in .env file!');
    return;
  }

  try {
    // Test basic connection
    console.log('\n1. Testing API connection...');
    const response = await axios.get(`${PORTAINER_URL}/api/endpoints`, {
      headers: { 'X-API-Key': PORTAINER_TOKEN }
    });
    console.log('✅ Connected successfully!');
    console.log(`Found ${response.data.length} endpoint(s)`);

    // List endpoints
    console.log('\n2. Available endpoints:');
    response.data.forEach(endpoint => {
      console.log(`   - ID: ${endpoint.Id}, Name: ${endpoint.Name}, Type: ${endpoint.Type}`);
    });

    // Test Docker API
    const endpointId = response.data[0]?.Id || 1;
    console.log(`\n3. Testing Docker API on endpoint ${endpointId}...`);
    
    const dockerInfo = await axios.get(
      `${PORTAINER_URL}/api/endpoints/${endpointId}/docker/info`,
      { headers: { 'X-API-Key': PORTAINER_TOKEN } }
    );
    
    console.log('✅ Docker API working!');
    console.log(`   Docker version: ${dockerInfo.data.ServerVersion}`);
    console.log(`   Containers: ${dockerInfo.data.Containers}`);
    console.log(`   Images: ${dockerInfo.data.Images}`);
    
    console.log('\n✅ All tests passed! The bridge is ready to use.');
    
  } catch (error) {
    console.error('\n❌ Connection test failed!');
    if (error.response) {
      console.error(`Status: ${error.response.status}`);
      console.error(`Message: ${JSON.stringify(error.response.data)}`);
    } else {
      console.error(`Error: ${error.message}`);
    }
  }
}

testConnection();
