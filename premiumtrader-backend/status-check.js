// Quick status check for multi-broker setup
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

// Load .env from project root (one level up)
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, '..', '.env') });

console.log('🔧 Multi-Broker Trading System Status\n');

// Check Zerodha Kite
console.log('📊 Zerodha Kite:');
const kiteKey = process.env.KITE_API_KEY;
const kiteSecret = process.env.KITE_API_SECRET;
console.log(`   API Key: ${kiteKey ? '✅ Configured' : '❌ Missing'}`);
console.log(`   API Secret: ${kiteSecret ? '✅ Configured' : '❌ Missing'}`);

// Check ICICI Breeze
console.log('\n🏦 ICICI Breeze:');
const breezeKey = process.env.BREEZE_API_KEY;
const breezeSecret = process.env.BREEZE_SECRET_KEY;
console.log(`   API Key: ${breezeKey ? '✅ Configured' : '⚠️ Missing'}`);
console.log(`   Secret Key: ${breezeSecret ? '✅ Configured' : '⚠️ Missing'}`);

// Check Fyers
console.log('\n📈 Fyers:');
const fyersClientId = process.env.FYERS_CLIENT_ID;
const fyersClientSecret = process.env.FYERS_CLIENT_SECRET;
const fyersRedirect = process.env.FYERS_REDIRECT_URL;
console.log(`   Client ID: ${fyersClientId ? '✅ Configured' : '❌ Missing'}`);
console.log(`   Client Secret: ${fyersClientSecret ? '✅ Configured' : '❌ Missing'}`);
console.log(`   Redirect URL: ${fyersRedirect ? '✅ Configured' : '❌ Missing'}`);
if (process.env.VITE_FYERS_CLIENT_SECRET) {
  console.log('   ⚠️ Frontend VITE_FYERS_CLIENT_SECRET is set — remove for production (secret must not be exposed).');
}

// Environment and server
console.log('\n🛠️  Environment:');
console.log(`   NODE_ENV: ${process.env.NODE_ENV || 'not set'}`);
console.log(`   PORT: ${process.env.PORT || 5000}`);

console.log('\n📋 Summary:');
console.log(`   • Zerodha Kite: ${kiteKey && kiteSecret ? '✅ Ready' : '❌ Not Ready'}`);
const breezeReady = !!(breezeKey && breezeSecret && !String(breezeKey).includes('your_icici_breeze'));
console.log(`   • ICICI Breeze: ${breezeReady ? '✅ Ready' : '⚠️  Needs Setup'}`);
const fyersReady = !!(fyersClientId && fyersClientSecret && fyersRedirect);
console.log(`   • Fyers: ${fyersReady ? '✅ Ready' : '❌ Not Ready'}`);

console.log('\n🚀 Start backend with: node premiumtrader-backend/server.js');