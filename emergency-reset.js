#!/usr/bin/env node
/**
 * Emergency Security Data Reset
 * Clears corrupted in-memory security tracking data
 */

const securityLogger = require('./UTILS/securityLogger');
const nodeCache = require('./UTILS/nodeCache');

console.log('🚨 Starting emergency security data reset...');

try {
    // Reset security logger data
    securityLogger.emergencyReset();
    
    // Clear NodeCache as well
    nodeCache.flushAll();
    
    console.log('✅ Emergency reset completed successfully!');
    console.log('🔄 Security alerts should stop appearing');
    console.log('💰 Win amounts should display correctly');
    
} catch (error) {
    console.error('❌ Emergency reset failed:', error.message);
    process.exit(1);
}

process.exit(0);