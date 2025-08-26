#!/usr/bin/env node
/**
 * Startup script for ATIVE Casino Web Portal
 * Shows the correct Railway URL in deploy logs
 */

const { spawn } = require('child_process');
const path = require('path');

// Determine the base URL
const getBaseUrl = () => {
  // Check for Railway-specific environment variables
  if (process.env.RAILWAY_STATIC_URL) {
    return `https://${process.env.RAILWAY_STATIC_URL}`;
  }
  
  // Check for custom domain or Railway default
  if (process.env.RAILWAY_PUBLIC_DOMAIN) {
    return `https://${process.env.RAILWAY_PUBLIC_DOMAIN}`;
  }
  
  // Default Railway URL for web portal
  if (process.env.NODE_ENV === 'production') {
    return 'https://ativecasinoportal.up.railway.app';
  }
  
  // Local development
  return `http://localhost:${process.env.PORT || 3000}`;
};

const port = process.env.PORT || 8080;
const baseUrl = getBaseUrl();

console.log('🚀 ATIVE Casino Web Portal starting...');
console.log(`📱 Portal URL: ${baseUrl}`);
console.log(`⚙️  Environment: ${process.env.NODE_ENV || 'development'}`);
console.log(`🔌 Port: ${port}`);
console.log('');

// Start the serve process
const serveProcess = spawn('npx', ['serve', '-s', 'build', '-l', port], {
  stdio: ['inherit', 'pipe', 'inherit'],
  cwd: __dirname
});

// Filter out the localhost message and replace with our own
serveProcess.stdout.on('data', (data) => {
  const output = data.toString();
  
  // Skip the default "Accepting connections" message
  if (output.includes('Accepting connections at http://localhost')) {
    console.log(`✅ Web Portal is live at: ${baseUrl}`);
    return;
  }
  
  // Pass through other messages
  process.stdout.write(output);
});

// Handle process termination
serveProcess.on('close', (code) => {
  console.log(`Web Portal process exited with code ${code}`);
  process.exit(code);
});

// Handle errors
serveProcess.on('error', (error) => {
  console.error('Error starting Web Portal:', error);
  process.exit(1);
});

// Handle SIGTERM and SIGINT for graceful shutdown
process.on('SIGTERM', () => {
  console.log('Received SIGTERM, shutting down gracefully...');
  serveProcess.kill('SIGTERM');
});

process.on('SIGINT', () => {
  console.log('Received SIGINT, shutting down gracefully...');
  serveProcess.kill('SIGINT');
});