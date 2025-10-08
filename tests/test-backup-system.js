/**
 * ATIVE Casino Bot - Backup System Test
 * Test script to validate backup functionality
 */

const logger = require('./UTILS/logger');
const BackupManager = require('./UTILS/backupManager');

async function testBackupSystem() {
    console.log('🧪 Testing ATIVE Casino Bot Backup System...');
    console.log('==========================================');

    try {
        // Test 1: Initialize backup manager
        console.log('\n📋 Test 1: Initializing Backup Manager...');
        const backupManager = new BackupManager();
        await backupManager.initialize();
        console.log('✅ Backup Manager initialized successfully');

        // Test 2: Check backup directory
        console.log('\n📋 Test 2: Checking backup directory...');
        const fs = require('fs').promises;
        try {
            await fs.access(backupManager.backupDir);
            console.log(`✅ Backup directory exists: ${backupManager.backupDir}`);
        } catch (error) {
            console.log(`❌ Backup directory not accessible: ${error.message}`);
            return;
        }

        // Test 3: List existing backups
        console.log('\n📋 Test 3: Listing existing backups...');
        const backups = await backupManager.listBackups();
        console.log(`📊 Found ${backups.length} existing backups`);
        
        if (backups.length > 0) {
            console.log('Recent backups:');
            backups.slice(0, 3).forEach((backup, index) => {
                const date = new Date(backup.timestamp).toLocaleString();
                console.log(`  ${index + 1}. ${backup.id} (${date}) - ${backupManager.formatBytes(backup.size)}`);
            });
        }

        // Test 4: Check database connection
        console.log('\n📋 Test 4: Testing database connection...');
        try {
            await backupManager.validateConnection();
            console.log('✅ Database connection successful');
        } catch (error) {
            console.log(`❌ Database connection failed: ${error.message}`);
            console.log('⚠️ Backup system requires database connection');
            return;
        }

        // Test 5: Check system dependencies
        console.log('\n📋 Test 5: Checking system dependencies...');
        const { exec } = require('child_process');
        const { promisify } = require('util');
        const execAsync = promisify(exec);

        try {
            await execAsync('mysqldump --version');
            console.log('✅ mysqldump available');
        } catch (error) {
            console.log('❌ mysqldump not found - backups will not work');
            console.log('   Install MySQL client tools to enable backups');
        }

        try {
            await execAsync('gzip --version');
            console.log('✅ gzip available for compression');
        } catch (error) {
            console.log('⚠️ gzip not found - compression disabled');
        }

        // Test 6: Get system status
        console.log('\n📋 Test 6: Getting system status...');
        const status = await backupManager.getStatus();
        console.log(`📊 System Status:`);
        console.log(`   Total Backups: ${status.totalBackups}`);
        console.log(`   Total Size: ${status.totalSize}`);
        console.log(`   Backup Directory: ${status.backupDirectory}`);

        if (status.latestBackup) {
            const latestDate = new Date(status.latestBackup.timestamp).toLocaleString();
            console.log(`   Latest Backup: ${status.latestBackup.id} (${latestDate})`);
        }

        // Test 7: Test backup creation (dry run)
        console.log('\n📋 Test 7: Testing backup creation (validation only)...');
        try {
            // Just test the database configuration and file paths
            const dbConfig = backupManager.getDatabaseConfig();
            console.log(`✅ Database config valid: ${dbConfig.host}:${dbConfig.port}/${dbConfig.database}`);
            
            const testBackupFile = `${backupManager.backupDir}/test_${Date.now()}.sql`;
            console.log(`✅ Backup file path: ${testBackupFile}`);
            
            console.log('⚠️ Skipping actual backup creation in test mode');
            console.log('   Use /backup create command in Discord to create real backups');
        } catch (error) {
            console.log(`❌ Backup creation test failed: ${error.message}`);
        }

        // Test 8: Environment variables check
        console.log('\n📋 Test 8: Checking environment variables...');
        const requiredVars = ['MARIADB_HOST', 'MARIADB_USER', 'MARIADB_PASSWORD', 'MARIADB_DATABASE'];
        let missingVars = [];

        for (const varName of requiredVars) {
            if (!process.env[varName]) {
                missingVars.push(varName);
            }
        }

        if (missingVars.length === 0) {
            console.log('✅ All required database environment variables are set');
        } else {
            console.log(`❌ Missing required environment variables: ${missingVars.join(', ')}`);
        }

        // Check optional cloud variables
        const cloudVars = {
            'Dropbox': 'DROPBOX_ACCESS_TOKEN',
            'AWS S3': 'AWS_ACCESS_KEY_ID',
            'Webhook': 'BACKUP_WEBHOOK_URL',
            'Encryption': 'BACKUP_ENCRYPTION_KEY'
        };

        console.log('\nOptional cloud backup configuration:');
        for (const [service, varName] of Object.entries(cloudVars)) {
            const status = process.env[varName] ? '✅' : '❌';
            console.log(`   ${service}: ${status} ${varName}`);
        }

        console.log('\n🎉 Backup System Test Complete!');
        console.log('==========================================');
        
        if (backups.length === 0) {
            console.log('💡 Tip: Create your first backup with: /backup create');
        }
        
        console.log('💡 Tip: Use /backup status in Discord for live system status');
        console.log('💡 Tip: Set up cloud storage for off-site backup protection');

    } catch (error) {
        console.log(`\n❌ Test failed: ${error.message}`);
        console.log('Stack trace:');
        console.log(error.stack);
    }
}

// Run the test
if (require.main === module) {
    testBackupSystem().then(() => {
        process.exit(0);
    }).catch((error) => {
        console.error('Test script error:', error);
        process.exit(1);
    });
}

module.exports = testBackupSystem;