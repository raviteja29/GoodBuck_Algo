// Quick test to verify Fyers integration
console.log('=== Fyers Integration Test ===');

// Test environment variables
console.log('Fyers Client ID:', import.meta.env.VITE_FYERS_CLIENT_ID);
console.log('Fyers Redirect URL:', import.meta.env.VITE_FYERS_REDIRECT_URL);
console.log('Fyers Base URL:', import.meta.env.VITE_FYERS_BASE_URL);

// Test if FyersService can be imported
try {
  import('../services/FyersService.js').then(service => {
    console.log('✅ FyersService imported successfully');
    console.log('Auth URL would be:', service.default.getAuthUrl());
  });
} catch (error) {
  console.error('❌ Error importing FyersService:', error);
}

// Test if useFyersAuth hook can be imported
try {
  import('../hooks/useFyersAuth.js').then(hook => {
    console.log('✅ useFyersAuth hook imported successfully');
  });
} catch (error) {
  console.error('❌ Error importing useFyersAuth:', error);
}