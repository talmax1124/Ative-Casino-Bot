#!/usr/bin/env node

/**
 * Migration script to fix users who have balance records but no level records
 * This script creates level records for users who are missing them
 */

const dbManager = require('./UTILS/database');
const logger = require('./UTILS/logger');

async function fixMissingUserLevels() {
    console.log('🔧 Fixing missing user level records...\n');
    
    try {
        // Wait for database to be initialized
        let attempts = 0;
        while (!dbManager.initialized && attempts < 15) {
            await new Promise(resolve => setTimeout(resolve, 1000));
            attempts++;
        }
        
        if (!dbManager.initialized) {
            throw new Error('Database not initialized after 15 seconds');
        }
        
        console.log('✅ Database connection: OK\n');

        // Get all users from user_balances who don't have level records
        console.log('🔍 Finding users missing level records...');
        const missingLevels = await dbManager.databaseAdapter.executeQuery(`
            SELECT DISTINCT ub.user_id, ub.guild_id, ub.username 
            FROM user_balances ub 
            LEFT JOIN user_levels ul ON ub.user_id = ul.user_id AND ub.guild_id = ul.guild_id 
            WHERE ul.user_id IS NULL
        `);
        
        if (missingLevels.length === 0) {
            console.log('✅ No users missing level records found!');
            return;
        }
        
        console.log(`📊 Found ${missingLevels.length} users missing level records:`);
        missingLevels.slice(0, 5).forEach(user => {
            console.log(`  👤 ${user.username} (${user.user_id}) in guild ${user.guild_id}`);
        });
        if (missingLevels.length > 5) {
            console.log(`  ... and ${missingLevels.length - 5} more\n`);
        } else {
            console.log('');
        }
        
        // Create level records for these users
        console.log('🛠️  Creating missing level records...');
        let created = 0;
        let failed = 0;
        
        for (const user of missingLevels) {
            try {
                // Use INSERT IGNORE to prevent duplicates
                const result = await dbManager.databaseAdapter.executeQuery(`
                    INSERT IGNORE INTO user_levels (user_id, guild_id, level, xp, total_xp, games_played, games_won, messages_sent, created_at, updated_at) 
                    VALUES (?, ?, 1, 0, 0, 0, 0, 0, NOW(), NOW())
                `, [user.user_id, user.guild_id]);
                
                if (result.affectedRows > 0) {
                    created++;
                    console.log(`  ✅ Created level record for ${user.username} (${user.user_id})`);
                } else {
                    console.log(`  ⚠️  Level record already exists for ${user.username} (${user.user_id})`);
                }
            } catch (error) {
                failed++;
                console.error(`  ❌ Failed to create level record for ${user.username}: ${error.message}`);
            }
        }
        
        console.log('\n📊 Migration Results:');
        console.log(`  ✅ Created: ${created} level records`);
        console.log(`  ❌ Failed: ${failed} level records`);
        console.log(`  📊 Total processed: ${missingLevels.length} users\n`);
        
        // Verify the fix worked
        console.log('🔍 Verifying fix...');
        const stillMissing = await dbManager.databaseAdapter.executeQuery(`
            SELECT COUNT(*) as count 
            FROM user_balances ub 
            LEFT JOIN user_levels ul ON ub.user_id = ul.user_id AND ub.guild_id = ul.guild_id 
            WHERE ul.user_id IS NULL
        `);
        
        if (stillMissing[0].count === 0) {
            console.log('✅ All users now have level records!');
        } else {
            console.log(`⚠️  ${stillMissing[0].count} users still missing level records`);
        }
        
        // Show some sample level data
        console.log('\n📊 Sample level data:');
        const sampleLevels = await dbManager.databaseAdapter.executeQuery(`
            SELECT ul.user_id, ub.username, ul.level, ul.total_xp, ul.games_played 
            FROM user_levels ul
            LEFT JOIN user_balances ub ON ul.user_id = ub.user_id AND ul.guild_id = ub.guild_id
            ORDER BY ul.total_xp DESC 
            LIMIT 10
        `);
        
        sampleLevels.forEach(user => {
            const username = user.username || `User ${user.user_id}`;
            console.log(`  👤 ${username}: Level ${user.level}, XP ${user.total_xp}, Games ${user.games_played}`);
        });
        
        console.log('\n🎯 Migration completed successfully!');
        return true;
        
    } catch (error) {
        console.error('❌ Migration failed:', error.message);
        console.error(error.stack);
        return false;
    }
}

// Run migration if this script is executed directly
if (require.main === module) {
    // Give database more time to initialize since bot might be running
    setTimeout(() => {
        fixMissingUserLevels().then((success) => {
            process.exit(success ? 0 : 1);
        }).catch(error => {
            console.error('Migration script crashed:', error);
            process.exit(1);
        });
    }, 5000); // Wait 5 seconds for database to initialize
}

module.exports = { fixMissingUserLevels };