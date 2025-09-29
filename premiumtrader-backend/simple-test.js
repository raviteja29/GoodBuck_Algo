// Simple test to check ICICI Breeze configuration
import dotenv from 'dotenv';

dotenv.config();

console.log('🧪 ICICI Breeze Configuration Test\n');

// Check environment variables
console.log('Environment Variables:');
console.log('BREEZE_API_KEY:', process.env.BREEZE_API_KEY || '❌ Not Set');
console.log('BREEZE_SECRET_KEY:', process.env.BREEZE_SECRET_KEY || '❌ Not Set');
console.log();

// Check if both are set
const hasApiKey = !!process.env.BREEZE_API_KEY;
const hasSecretKey = !!process.env.BREEZE_SECRET_KEY;

if (hasApiKey && hasSecretKey) {
  console.log('✅ ICICI Breeze credentials are configured in .env file');
  
  // Check if they're still placeholder values
  if (process.env.BREEZE_API_KEY.includes('your_icici_breeze') || 
      process.env.BREEZE_SECRET_KEY.includes('your_icici_breeze')) {
    console.log('⚠️  Credentials appear to be placeholder values');
    console.log('   Please replace with your actual ICICI Breeze API credentials');
  } else {
    console.log('✅ Credentials appear to be real values (not placeholders)');
  }
} else {
  console.log('❌ ICICI Breeze credentials are missing');
}

console.log('\nNext Steps:');
console.log('1. Get your API credentials from ICICI Direct portal');
console.log('2. Update BREEZE_API_KEY and BREEZE_SECRET_KEY in .env file');  
console.log('3. Start server with: node server-new.js');
console.log('4. Test login through frontend application');

console.log('\nFor detailed setup instructions, see:');
console.log('- ICICI_BREEZE_SETUP.md');
console.log('- BREEZE_CREDENTIALS_TEMPLATE.md');