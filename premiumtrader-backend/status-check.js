// Quick status check for multi-broker setup
import dotenv from 'dotenv';

dotenv.config();

console.log('🔧 Multi-Broker Trading System Status\n');

// Check Zerodha Kite
console.log('📊 Zerodha Kite:');
const kiteKey = process.env.KITE_API_KEY;
const kiteSecret = process.env.KITE_API_SECRET;

if (kiteKey && kiteSecret) {
  console.log('   ✅ API Key: Configured');
  console.log('   ✅ API Secret: Configured');
  console.log('   ✅ Status: Ready to use');
} else {
  console.log('   ❌ Missing credentials');
}

// Check ICICI Breeze  
console.log('\n🏦 ICICI Breeze:');
const breezeKey = process.env.BREEZE_API_KEY;
const breezeSecret = process.env.BREEZE_SECRET_KEY;

if (breezeKey && breezeSecret) {
  if (breezeKey.includes('your_icici_breeze') || breezeSecret.includes('your_icici_breeze')) {
    console.log('   ⚠️  API Key: Placeholder value');
    console.log('   ⚠️  Secret Key: Placeholder value');
    console.log('   ⏳ Status: Needs actual credentials');
  } else {
    console.log('   ✅ API Key: Configured');
    console.log('   ✅ Secret Key: Configured');
    console.log('   ✅ Status: Ready to test');
  }
} else {
  console.log('   ❌ Missing credentials');
}

console.log('\n📋 Summary:');
console.log(`   • Zerodha Kite: ${kiteKey && kiteSecret ? '✅ Ready' : '❌ Not Ready'}`);
console.log(`   • ICICI Breeze: ${breezeKey && breezeSecret && !breezeKey.includes('your_icici_breeze') ? '✅ Ready' : '⚠️  Needs Setup'}`);

console.log('\n🚀 Ready to start server with: node server-new.js');