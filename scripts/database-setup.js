#!/usr/bin/env node

/**
 * Database Setup Script for ATIVE Casino Bot
 * Initializes database schema and performs migrations
 */

const path = require('path');
const fs = require('fs').promises;
require('dotenv').config();

// Import utilities
const logger = require('../UTILS/logger');

async function setupDatabase() {
    console.log('🗄️  ATIVE Casino Bot - Database Setup');
    console.log('=====================================');

    try {
        // Try to initialize the database adapter
        const DatabaseAdapter = require('../UTILS/databaseAdapter');
        
        console.log('📡 Connecting to database...');
        await DatabaseAdapter.initialize();
        
        console.log('✅ Database connection successful!');
        console.log(`🔧 Database type: ${DatabaseAdapter.useMariaDB ? 'MariaDB' : 'Firebase (fallback)'}`);
        
        // Test basic operations
        if (DatabaseAdapter.useMariaDB) {
            console.log('🧪 Testing MariaDB operations...');
            
            // Test user balance creation
            const testUserId = 'test_setup_user_12345';
            await DatabaseAdapter.getUserBalance(testUserId);
            console.log('✅ User balance operations working');
            
            // Clean up test data
            if (DatabaseAdapter.pool) {
                const connection = await DatabaseAdapter.pool.getConnection();
                try {
                    await connection.execute('DELETE FROM user_balances WHERE user_id = ?', [testUserId]);
                    console.log('🧹 Cleaned up test data');
                } finally {
                    connection.release();
                }
            }
        }

        console.log('🎯 Database setup completed successfully!');
        return true;
        
    } catch (error) {
        console.error('❌ Database setup failed:', error.message);
        
        // Try Firebase fallback setup
        try {
            console.log('🔄 Attempting Firebase fallback setup...');
            const DatabaseManager = require('../UTILS/database');
            await DatabaseManager.initialize();
            console.log('✅ Firebase fallback setup successful!');
            return true;
        } catch (fallbackError) {
            console.error('❌ Firebase fallback also failed:', fallbackError.message);
            return false;
        }
    }
}

async function createBackupDirectories() {
    const directories = [
        path.join(process.cwd(), 'logs'),
        path.join(process.cwd(), 'backups'),
        path.join(process.cwd(), 'temp')
    ];

    for (const dir of directories) {
        try {
            await fs.mkdir(dir, { recursive: true });
            console.log(`📁 Created directory: ${dir}`);
        } catch (error) {
            if (error.code !== 'EEXIST') {
                console.warn(`⚠️  Could not create directory ${dir}: ${error.message}`);
            }
        }
    }
}

async function validateEnvironment() {
    console.log('🔍 Validating environment configuration...');
    
    const required = ['DISCORD_TOKEN', 'CLIENT_ID'];
    const missing = [];
    
    for (const key of required) {
        if (!process.env[key] || process.env[key].includes('your_')) {
            missing.push(key);
        }
    }
    
    if (missing.length > 0) {
        console.error('❌ Missing or invalid environment variables:');
        missing.forEach(key => console.error(`   - ${key}`));
        return false;
    }
    
    // Check database configuration
    const hasMariaDB = process.env.MARIADB_HOST && process.env.MARIADB_USER && !process.env.MARIADB_PASSWORD?.includes('your_');
    const hasPostgreSQL = process.env.POSTGRES_HOST && process.env.POSTGRES_USER && !process.env.POSTGRES_PASSWORD?.includes('your_');
    const hasFirebase = process.env.FIREBASE_PROJECT_ID && !process.env.FIREBASE_PROJECT_ID?.includes('your_');
    
    if (!hasMariaDB && !hasPostgreSQL && !hasFirebase) {
        console.error('❌ No valid database configuration found');
        console.error('   Configure at least one: MariaDB, PostgreSQL, or Firebase');
        return false;
    }
    
    if (hasMariaDB) console.log('✅ MariaDB configuration detected');
    if (hasPostgreSQL) console.log('✅ PostgreSQL configuration detected');
    if (hasFirebase) console.log('✅ Firebase configuration detected');
    
    return true;
}

async function main() {
    try {
        // Validate environment
        const envValid = await validateEnvironment();
        if (!envValid) {
            process.exit(1);
        }
        
        // Create necessary directories
        await createBackupDirectories();
        
        // Setup database
        const dbSetup = await setupDatabase();
        if (!dbSetup) {
            console.error('❌ Database setup failed - bot may not function correctly');
            process.exit(1);
        }
        
        console.log('🎉 Setup completed successfully!');
        console.log('🚀 You can now start the bot with: node index.js');
        
    } catch (error) {
        console.error('💥 Setup script failed:', error.message);
        logger.error(`Setup script error: ${error.message}`);
        process.exit(1);
    }
}

// Run if called directly
if (require.main === module) {
    main();
}

module.exports = { setupDatabase, validateEnvironment, createBackupDirectories };