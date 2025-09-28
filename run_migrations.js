/**
 * Migration runner for sports betting tables
 */

const fs = require('fs');
const path = require('path');
require('dotenv').config();

// Import database manager
const dbManager = require('./UTILS/database');

async function runMigrations() {
    try {
        console.log('🚀 Starting sports betting migrations...');
        
        // Check if database adapter is available
        if (!dbManager.databaseAdapter) {
            throw new Error('Database adapter not initialized. Please start the bot first to initialize the database.');
        }
        console.log('✅ Database connection established');
        
        // Read and execute sport_bets migration
        const sportBetsSql = fs.readFileSync(
            path.join(__dirname, 'migrations/create_sport_bets_table.sql'), 
            'utf8'
        );
        
        console.log('📋 Running sport_bets table migration...');
        const statements1 = sportBetsSql.split(';').filter(stmt => stmt.trim());
        
        for (const statement of statements1) {
            if (statement.trim()) {
                await dbManager.databaseAdapter.executeQuery(statement.trim());
                console.log(`✅ Executed: ${statement.trim().substring(0, 50)}...`);
            }
        }
        
        // Read and execute sports cache migration
        const sportsCacheSql = fs.readFileSync(
            path.join(__dirname, 'migrations/create_sports_cache_tables.sql'), 
            'utf8'
        );
        
        console.log('💾 Running sports cache tables migration...');
        const statements2 = sportsCacheSql.split(';').filter(stmt => stmt.trim());
        
        for (const statement of statements2) {
            if (statement.trim()) {
                await dbManager.databaseAdapter.executeQuery(statement.trim());
                console.log(`✅ Executed: ${statement.trim().substring(0, 50)}...`);
            }
        }
        
        console.log('🎉 All migrations completed successfully!');
        console.log('');
        console.log('📊 Tables created:');
        console.log('  - sport_bets (for tracking user bets)');
        console.log('  - sports_games_cache (for caching API data)');
        console.log('  - api_usage_tracking (for monitoring API usage)');
        console.log('  - api_keys_config (for API key management)');
        console.log('');
        console.log('🎯 Sports betting system is now ready!');
        
    } catch (error) {
        console.error('❌ Migration failed:', error.message);
        process.exit(1);
    } finally {
        process.exit(0);
    }
}

// Run migrations
runMigrations();