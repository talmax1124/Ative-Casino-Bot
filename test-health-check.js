#!/usr/bin/env node

/**
 * Health Check Test Script
 * Tests the health check server endpoints without running the full Discord bot
 */

const HealthCheckServer = require('./UTILS/healthCheck');
const http = require('http');

console.log('🧪 Testing Health Check Server...\n');

// Mock Discord client for testing
const mockClient = {
    isReady: () => true,
    guilds: { cache: { size: 5 } },
    users: { cache: { size: 1000 } },
    channels: { cache: { size: 50 } },
    ws: { ping: 25 },
    application: { commands: { cache: { size: 10 } } }
};

// Set test port to avoid conflicts
process.env.PORT = '3333';

// Create health check server
const healthServer = new HealthCheckServer(mockClient);
const server = healthServer.start();

// Test endpoints
const testEndpoints = async () => {
    const PORT = process.env.PORT || 3000;
    const baseUrl = `http://localhost:${PORT}`;
    
    const endpoints = ['/', '/health', '/ready', '/metrics'];
    
    // Wait for server to start
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    console.log(`🌐 Testing endpoints on ${baseUrl}\n`);
    
    for (const endpoint of endpoints) {
        try {
            const response = await makeRequest(`${baseUrl}${endpoint}`);
            console.log(`✅ ${endpoint}: ${response.status} ${response.statusText}`);
            
            if (endpoint === '/health') {
                const data = JSON.parse(response.data);
                console.log(`   Status: ${data.status}`);
                console.log(`   Bot Status: ${data.botStatus}`);
                console.log(`   Uptime: ${Math.floor(data.uptime)}s`);
                console.log(`   Guilds: ${data.guilds || 'N/A'}`);
            }
        } catch (error) {
            console.log(`❌ ${endpoint}: ${error.message}`);
        }
        console.log('');
    }
    
    // Test 404 endpoint
    try {
        await makeRequest(`${baseUrl}/nonexistent`);
    } catch (error) {
        if (error.message.includes('404')) {
            console.log('✅ /nonexistent: 404 Not Found (expected)');
        } else {
            console.log(`❌ /nonexistent: ${error.message}`);
        }
    }
    
    console.log('\n🏁 Health check test completed!');
    
    // Stop server
    healthServer.stop();
    process.exit(0);
};

// Helper function to make HTTP requests
const makeRequest = (url) => {
    return new Promise((resolve, reject) => {
        const request = http.get(url, (response) => {
            let data = '';
            
            response.on('data', (chunk) => {
                data += chunk;
            });
            
            response.on('end', () => {
                resolve({
                    status: response.statusCode,
                    statusText: response.statusMessage,
                    data: data
                });
            });
        });
        
        request.on('error', (error) => {
            reject(error);
        });
        
        request.setTimeout(5000, () => {
            request.destroy();
            reject(new Error('Request timeout'));
        });
    });
};

// Handle process termination
process.on('SIGINT', () => {
    console.log('\n🛑 Test interrupted');
    healthServer.stop();
    process.exit(0);
});

process.on('SIGTERM', () => {
    console.log('\n🛑 Test terminated');
    healthServer.stop();
    process.exit(0);
});

// Run tests
testEndpoints().catch((error) => {
    console.error('\n❌ Test failed:', error.message);
    healthServer.stop();
    process.exit(1);
});