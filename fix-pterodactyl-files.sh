#!/bin/bash

# ATIVE Casino Bot - File Fix for Pterodactyl
# This script fixes database files to remove Firebase dependencies

echo "🔧 Fixing database files to remove Firebase dependencies..."

# Fix the database.js file
cat > /home/container/UTILS/database.js << 'EOF'
/**
 * Database Management for ATIVE Casino Bot
 * Pure MariaDB implementation (no Firebase)
 */

const logger = require('./logger');

class DatabaseManager {
    constructor() {
        this.databaseAdapter = null;
        this.initialized = false;
        this.usingAdapter = false;
    }

    /**
     * Initialize database connection with MariaDB only
     */
    async initialize() {
        if (this.initialized) return;

        // Use the database adapter (MariaDB only)
        try {
            const DatabaseAdapter = require('./databaseAdapter');
            this.databaseAdapter = DatabaseAdapter;
            await this.databaseAdapter.initialize();
            this.usingAdapter = true;
            this.initialized = true;
            logger.info('Database manager initialized with MariaDB');
            return;
        } catch (adapterError) {
            logger.error(`Database connection failed: ${adapterError.message}`);
            throw new Error(`Database connection failed: ${adapterError.message}`);
        }
    }

    // Delegate all methods to the adapter
    async getUserBalance(userId, guildId = null) {
        return await this.databaseAdapter.getUserBalance(userId, guildId);
    }

    async updateUserBalance(userId, guildId = null, walletChange = 0, bankChange = 0, kwargs = {}) {
        return await this.databaseAdapter.updateUserBalance(userId, guildId, walletChange, bankChange, kwargs);
    }

    async setUserBalance(userId, guildId = null, wallet = null, bank = null, kwargs = {}) {
        return await this.databaseAdapter.setUserBalance(userId, guildId, wallet, bank, kwargs);
    }

    async getBalances(userId, guildId) {
        return await this.databaseAdapter.getBalances(userId, guildId);
    }

    async setBalances(userId, guildId, wallet = null, bank = null) {
        return await this.databaseAdapter.setBalances(userId, guildId, wallet, bank);
    }

    async adjustWallet(userId, guildId, delta, floor = 0.0) {
        return await this.databaseAdapter.adjustWallet(userId, guildId, delta, floor);
    }

    async ensureUser(userId, username = null) {
        return await this.databaseAdapter.ensureUser(userId, username);
    }

    async updateUsername(userId, username) {
        return await this.databaseAdapter.updateUsername(userId, username);
    }

    // Placeholder methods
    async getUserStats(userId, guildId = null, gameType = null) {
        return await this.databaseAdapter.getUserStats(userId, guildId, gameType);
    }

    async updateUserStats(userId, guildId = null, gameType = null, win = null, wagered = 0, result = 0, userProfile = null) {
        return await this.databaseAdapter.updateUserStats(userId, guildId, gameType, win, wagered, result, userProfile);
    }

    async getLotteryInfo(guildId) {
        return await this.databaseAdapter.getLotteryInfo(guildId);
    }

    async getUserLotteryTickets(userId, guildId) {
        return await this.databaseAdapter.getUserLotteryTickets(userId, guildId);
    }

    async purchaseLotteryTickets(userId, guildId, ticketCount, totalCost) {
        return await this.databaseAdapter.purchaseLotteryTickets(userId, guildId, ticketCount, totalCost);
    }

    async getTopUsersByBalance(guildId, limit = 10) {
        return await this.databaseAdapter.getTopUsersByBalance(guildId, limit);
    }

    async getTopUsersByWins(guildId, limit = 10) {
        return await this.databaseAdapter.getTopUsersByWins(guildId, limit);
    }

    async storePoll(pollId, pollData) {
        return await this.databaseAdapter.storePoll(pollId, pollData);
    }

    async updatePollVotes(pollId, votes) {
        return await this.databaseAdapter.updatePollVotes(pollId, votes);
    }

    async endPoll(pollId) {
        return await this.databaseAdapter.endPoll(pollId);
    }
}

// Export singleton instance
module.exports = new DatabaseManager();
EOF

# Fix the database-setup.js file
cat > /home/container/scripts/database-setup.js << 'EOF'
#!/usr/bin/env node

/**
 * Database Setup Script for ATIVE Casino Bot
 * MariaDB only setup - no Firebase
 */

const path = require('path');
const fs = require('fs').promises;
require('dotenv').config();

// Import utilities
const logger = require('../UTILS/logger');

async function setupDatabase() {
    console.log('🗄️  ATIVE Casino Bot - Database Setup (MariaDB Only)');
    console.log('=====================================================');

    try {
        // Initialize the database adapter
        const DatabaseAdapter = require('../UTILS/databaseAdapter');
        
        console.log('📡 Connecting to MariaDB...');
        await DatabaseAdapter.initialize();
        
        console.log('✅ MariaDB connection successful!');
        console.log('🎯 Database setup completed successfully!');
        return true;
        
    } catch (error) {
        console.error('❌ Database setup failed:', error.message);
        console.error('❌ Database setup failed - MariaDB connection is required');
        return false;
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
    
    // Check MariaDB configuration only
    const hasMariaDB = process.env.MARIADB_HOST && process.env.MARIADB_USER && process.env.MARIADB_PASSWORD && !process.env.MARIADB_PASSWORD?.includes('your_');
    
    if (!hasMariaDB) {
        console.error('❌ MariaDB configuration required');
        console.error('   Please configure MARIADB_HOST, MARIADB_USER, MARIADB_PASSWORD, MARIADB_DATABASE');
        return false;
    }
    
    console.log('✅ MariaDB configuration detected');
    
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
EOF

# Remove Firebase-related environment variables from .env
if [ -f /home/container/.env ]; then
    echo "🧹 Cleaning Firebase references from .env file..."
    sed -i '/FIREBASE/d' /home/container/.env
fi

# Fix startup.sh to remove cron references
if [ -f /home/container/startup.sh ]; then
    echo "🔧 Fixing startup.sh cron references..."
    sed -i 's/crontab.*//g' /home/container/startup.sh
    sed -i '/service cron start/d' /home/container/startup.sh
fi

echo "✅ All files fixed for MariaDB-only operation!"
echo "🚀 Bot should now start without Firebase errors"
EOF

chmod +x /home/container/fix-pterodactyl-files.sh