// Test script for ICICI Breeze API credentials
// Run this script to verify your Breeze setup: node test-breeze.js

import dotenv from 'dotenv';
import BrokerManager from './brokers/BrokerManager.js';

dotenv.config();

async function testBreezeSetup() {
  console.log('🧪 Testing ICICI Breeze API Setup...\n');

  // 1. Check environment variables
  console.log('1. Checking Environment Variables:');
  const apiKey = process.env.BREEZE_API_KEY;
  const secretKey = process.env.BREEZE_SECRET_KEY;
  
  console.log(`   ✓ BREEZE_API_KEY: ${apiKey ? '✅ Set' : '❌ Not Set'}`);
  console.log(`   ✓ BREEZE_SECRET_KEY: ${secretKey ? '✅ Set' : '❌ Not Set'}\n`);

  if (!apiKey || !secretKey) {
    console.log('❌ Please set your BREEZE_API_KEY and BREEZE_SECRET_KEY in .env file');
    console.log('   Refer to ICICI_BREEZE_SETUP.md for instructions\n');
    return;
  }

  // 2. Test broker initialization
  console.log('2. Testing Broker Initialization:');
  try {
    const brokerManager = BrokerManager;
    const brokers = brokerManager.getBrokerList();
    
    const breezeBroker = brokers.find(b => b.id === 'breeze');
    if (breezeBroker) {
      console.log(`   ✅ ICICI Breeze broker detected`);
      console.log(`   ✅ Configuration status: ${breezeBroker.isAvailable ? 'Available' : 'Not Available'}\n`);
    } else {
      console.log('   ❌ ICICI Breeze broker not found\n');
      return;
    }

    // 3. Test broker switching
    console.log('3. Testing Broker Selection:');
    try {
      brokerManager.setBroker('breeze');
      console.log('   ✅ Successfully switched to ICICI Breeze\n');
    } catch (error) {
      console.log(`   ❌ Failed to switch to Breeze: ${error.message}\n`);
      return;
    }

    // 4. Test configuration validation
    console.log('4. Testing Configuration Validation:');
    const validation = brokerManager.validateBrokerConfig('breeze');
    if (validation.valid) {
      console.log('   ✅ Breeze configuration is valid\n');
    } else {
      console.log(`   ❌ Configuration error: ${validation.error}\n`);
      return;
    }

    console.log('🎉 ICICI Breeze setup appears to be correct!');
    console.log('\nNext Steps:');
    console.log('1. Start your server: node server-new.js');
    console.log('2. Open your frontend application');
    console.log('3. Select "ICICI Breeze" from broker dropdown');
    console.log('4. Login with your ICICI Direct credentials');
    console.log('\nCredentials needed for login:');
    console.log('- Username: Your ICICI Direct login ID');
    console.log('- Password: Your ICICI Direct password');
    console.log('- API Secret: Your 2PIN from ICICI Direct API settings');

  } catch (error) {
    console.log(`❌ Error during testing: ${error.message}\n`);
    console.log('Please check your configuration and try again.');
  }
}

// Helper function to test actual authentication (optional)
async function testAuthentication() {
  console.log('\n🔐 Testing Authentication (Optional):');
  console.log('This requires your actual ICICI Direct credentials.');
  console.log('Run this manually with your credentials to test login.\n');
  
  // Uncomment and modify the following code to test actual authentication:
  /*
  const brokerManager = BrokerManager;
  brokerManager.setBroker('breeze');
  
  try {
    const result = await brokerManager.generateSession({
      username: 'YOUR_USERNAME',      // Replace with your username
      password: 'YOUR_PASSWORD',      // Replace with your password  
      apiSecret: 'YOUR_2PIN'          // Replace with your 2PIN
    });
    
    console.log('✅ Authentication successful!');
    console.log(`   User: ${result.user_name}`);
    console.log(`   Broker: ${result.broker}`);
  } catch (error) {
    console.log(`❌ Authentication failed: ${error.message}`);
  }
  */
}

// Run the tests
if (import.meta.url === `file://${process.argv[1]}`) {
  testBreezeSetup();
  // testAuthentication(); // Uncomment to test actual login
}