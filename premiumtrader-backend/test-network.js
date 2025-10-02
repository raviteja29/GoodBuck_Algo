// Test network connectivity for ICICI Breeze IP registration
import { createServer } from 'http';

const port = 3001; // Use different port for testing

const server = createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({
    message: 'Server accessible from network IP',
    timestamp: new Date().toISOString(),
    clientIP: req.connection.remoteAddress,
    headers: req.headers
  }));
});

server.listen(port, '0.0.0.0', () => {
  console.log('🧪 Network Connectivity Test');
  console.log(`✅ Server running on all interfaces (0.0.0.0:${port})`);
  console.log(`🌐 Test URLs:`);
  console.log(`   - http://localhost:${port} (localhost access)`);
  console.log(`   - http://127.0.0.1:${port} (loopback access)`);
  console.log(`   - http://192.168.68.52:${port} (network access)`);
  console.log('');
  console.log('✅ Ready for ICICI Breeze registration with IP: 192.168.68.52');
  console.log('🛑 Press Ctrl+C to stop test server');
});

server.on('error', (err) => {
  console.error('❌ Server error:', err.message);
});

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('\n🛑 Shutting down test server...');
  server.close(() => {
    console.log('✅ Test server stopped');
    process.exit(0);
  });
});