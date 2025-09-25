import { createRequire } from 'module';
import dotenv from 'dotenv';

const require = createRequire(import.meta.url);
const KiteConnect = require('kiteconnect').KiteConnect;

// Load environment variables
dotenv.config();

const kc = new KiteConnect({
  api_key: process.env.KITE_API_KEY
});

async function generateAccessToken(requestToken) {
  try {
    console.log('API Key:', process.env.KITE_API_KEY);
    console.log('Request Token:', requestToken);
    
    const response = await kc.generateSession(requestToken, process.env.KITE_API_SECRET);
    
    console.log('\n=== SUCCESS ===');
    console.log('Access Token:', response.access_token);
    console.log('User ID:', response.user_id);
    console.log('User Name:', response.user_name);
    console.log('Email:', response.email);
    console.log('User Type:', response.user_type);
    console.log('Broker:', response.broker);
    
    console.log('\n=== FORMATTED TOKEN FOR WEBSOCKET ===');
    console.log(`${process.env.KITE_API_KEY}:${response.access_token}`);
    
    return response;
  } catch (error) {
    console.error('Error generating session:', error);
    throw error;
  }
}

// Get request token from command line argument
const requestToken = process.argv[2];

if (!requestToken) {
  console.log('\n=== HOW TO USE ===');
  console.log('1. Visit: https://kite.trade/connect/login?api_key=mt23bk4vqz8uryv2&v=3');
  console.log('2. Login and authorize');
  console.log('3. Copy the request_token from the redirect URL');
  console.log('4. Run: node generate_token.js YOUR_REQUEST_TOKEN');
  console.log('\nExample:');
  console.log('node generate_token.js abc123def456ghi789');
  process.exit(1);
}

console.log('Generating access token...');
generateAccessToken(requestToken)
  .then(() => {
    console.log('\nToken generated successfully!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('Failed to generate token:', error.message);
    process.exit(1);
  });