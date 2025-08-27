#!/usr/bin/env node

// Simple health check script for monitoring
const http = require('http');

const PORT = process.env.PORT || 3000;
const HOST = process.env.HOST || 'localhost';

const options = {
  hostname: HOST,
  port: PORT,
  path: '/api/health',
  method: 'GET',
  timeout: 5000
};

const req = http.request(options, (res) => {
  let data = '';
  
  res.on('data', (chunk) => {
    data += chunk;
  });
  
  res.on('end', () => {
    try {
      const health = JSON.parse(data);
      if (health.status === 'OK' && health.database === 'connected') {
        console.log('✅ Service is healthy');
        process.exit(0);
      } else {
        console.log('❌ Service is unhealthy:', health);
        process.exit(1);
      }
    } catch (err) {
      console.log('❌ Invalid health response:', data);
      process.exit(1);
    }
  });
});

req.on('error', (err) => {
  console.log('❌ Health check failed:', err.message);
  process.exit(1);
});

req.on('timeout', () => {
  console.log('❌ Health check timed out');
  req.destroy();
  process.exit(1);
});

req.end();