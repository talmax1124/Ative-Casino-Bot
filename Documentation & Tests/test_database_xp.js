#!/usr/bin/env node

/**
 * Test script to check database XP data directly
 * Tests if user_levels table exists and has proper data
 */

const dbManager = require('./UTILS/database');
const logger = require('./UTILS/logger');

async function testDatabaseXP() {
    console.log('🔍 Testing database XP data directly...\n');
    
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

        // Check if user_levels table exists
        console.log('📋 Checking user_levels table structure...');
        const structure = await dbManager.databaseAdapter.executeQuery(
            "DESCRIBE user_levels"
        );
        
        console.log('🏗️  Table structure:');
        structure.forEach(col => {
            console.log(`  ${col.Field}: ${col.Type} ${col.Null === 'YES' ? '(nullable)' : '(not null)'}`);
        });
        console.log('');
        
        // Check existing user level data
        console.log('🔍 Checking existing user level data...');
        const userData = await dbManager.databaseAdapter.executeQuery(
            "SELECT user_id, level, xp, total_xp, games_played, games_won, last_level_up, created_at FROM user_levels ORDER BY total_xp DESC LIMIT 10"
        );
        
        if (userData.length === 0) {
            console.log('⚠️  No user level data found in database!');
            
            // Check if there are users in user_balances but not user_levels
            console.log('\n🔍 Checking users in user_balances vs user_levels...');
            const balanceUsers = await dbManager.databaseAdapter.executeQuery(
                "SELECT COUNT(*) as count FROM user_balances"
            );
            
            const levelUsers = await dbManager.databaseAdapter.executeQuery(
                "SELECT COUNT(*) as count FROM user_levels"
            );
            
            console.log(`👥 Users with balances: ${balanceUsers[0].count}`);
            console.log(`👥 Users with level data: ${levelUsers[0].count}`);
            
            if (balanceUsers[0].count > levelUsers[0].count) {
                console.log('🚨 ISSUE FOUND: Users have balances but no level data!');
                
                // Show sample users missing level data
                const missingLevels = await dbManager.databaseAdapter.executeQuery(
                    `SELECT ub.user_id, ub.username 
                     FROM user_balances ub 
                     LEFT JOIN user_levels ul ON ub.user_id = ul.user_id 
                     WHERE ul.user_id IS NULL 
                     LIMIT 5`
                );
                
                console.log('👤 Sample users missing level data:');
                missingLevels.forEach(user => {
                    console.log(`  ${user.username} (${user.user_id})`);
                });
            }
        } else {
            console.log(`📊 Found ${userData.length} users with level data:`);
            userData.forEach(user => {
                console.log(`  👤 User ${user.user_id}: Level ${user.level}, XP ${user.xp}/${user.total_xp}, Games ${user.games_played}/${user.games_won}`);
            });
        }
        console.log('');
        
        // Test the calculation functions
        console.log('🧮 Testing level calculation functions...');
        const testCases = [0, 100, 400, 900, 1600, 2500, 10000];
        testCases.forEach(totalXP => {
            const level = dbManager.databaseAdapter.calculateLevel(totalXP);
            const currentXP = dbManager.databaseAdapter.calculateCurrentXp(totalXP);
            console.log(`  Total XP: ${totalXP} -> Level: ${level}, Current XP: ${currentXP}`);
        });
        console.log('');
        
        // Test addXpToUser function on a test user
        console.log('🧪 Testing XP addition...');
        const testUserId = 'test_xp_user_123456789';
        const testGuildId = 'test_guild_987654321';
        
        try {
            // Add XP to test user
            const result = await dbManager.addXpToUser(testUserId, testGuildId, 50, 'test_run');
            console.log('✅ XP addition result:', result);
            
            if (result) {
                console.log(`  Previous Level: ${result.previousLevel} -> New Level: ${result.newLevel}`);
                console.log(`  Previous XP: ${result.previousXp} -> New XP: ${result.newXp}`);
                console.log(`  Total XP: ${result.totalXp}, Leveled Up: ${result.leveledUp}`);
            }
            
            // Check if the data was actually written
            const levelData = await dbManager.databaseAdapter.getUserLevel(testUserId, testGuildId);
            console.log('📊 Verified level data:', levelData);
            
        } catch (xpError) {
            console.error('❌ XP addition test failed:', xpError.message);
        }
        
        console.log('\n🎯 Database XP test completed!');
        return true;
        
    } catch (error) {
        console.error('❌ Database XP test failed:', error.message);
        console.error(error.stack);
        return false;
    }
}

// Run test if this script is executed directly
if (require.main === module) {
    // Give database more time to initialize since bot might be running
    setTimeout(() => {
        testDatabaseXP().then((success) => {
            process.exit(success ? 0 : 1);
        }).catch(error => {
            console.error('Test script crashed:', error);
            process.exit(1);
        });
    }, 5000); // Wait 5 seconds for database to initialize
}

module.exports = { testDatabaseXP };