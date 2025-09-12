#!/usr/bin/env node

/**
 * XP System Test Script
 * Tests the leveling and XP system functionality
 */

const dbManager = require('./UTILS/database');
const levelingSystem = require('./UTILS/levelingSystem');
const logger = require('./UTILS/logger');

// Test configuration
const TEST_USER_ID = 'test_user_123456789';
const TEST_GUILD_ID = 'test_guild_987654321';

async function testDatabaseConnection() {
    console.log('🔌 Testing database connection...');
    
    try {
        // Wait for database to be initialized
        let attempts = 0;
        while (!dbManager.initialized && attempts < 10) {
            await new Promise(resolve => setTimeout(resolve, 1000));
            attempts++;
        }
        
        if (!dbManager.initialized) {
            throw new Error('Database not initialized after 10 seconds');
        }
        
        console.log('✅ Database connection: OK');
        return true;
    } catch (error) {
        console.error('❌ Database connection failed:', error.message);
        return false;
    }
}

async function testUserLevelCreation() {
    console.log('👤 Testing user level creation...');
    
    try {
        const userLevel = await dbManager.databaseAdapter.getUserLevel(TEST_USER_ID, TEST_GUILD_ID);
        console.log('✅ User level record:', userLevel);
        return true;
    } catch (error) {
        console.error('❌ User level creation failed:', error.message);
        return false;
    }
}

async function testAddXP() {
    console.log('⭐ Testing XP addition...');
    
    try {
        const result = await dbManager.addXpToUser(TEST_USER_ID, TEST_GUILD_ID, 50, 'test');
        console.log('✅ XP addition result:', result);
        
        if (!result) {
            console.error('❌ XP addition returned null result');
            return false;
        }
        
        return true;
    } catch (error) {
        console.error('❌ XP addition failed:', error.message);
        return false;
    }
}

async function testLevelingSystemCall() {
    console.log('🎮 Testing leveling system handleGameComplete...');
    
    try {
        const result = await levelingSystem.handleGameComplete(
            TEST_USER_ID, 
            TEST_GUILD_ID, 
            'blackjack', 
            true, // won
            null // no special result
        );
        
        console.log('✅ Leveling system result:', result);
        
        if (!result) {
            console.error('❌ Leveling system returned null result');
            return false;
        }
        
        return true;
    } catch (error) {
        console.error('❌ Leveling system failed:', error.message);
        return false;
    }
}

async function testLevelCalculation() {
    console.log('🧮 Testing level calculations...');
    
    try {
        const testXP = 500;
        const level = dbManager.databaseAdapter.calculateLevel(testXP);
        const currentXP = dbManager.databaseAdapter.calculateCurrentXp(testXP);
        
        console.log(`✅ XP: ${testXP} -> Level: ${level}, Current XP: ${currentXP}`);
        
        // Test multiple levels
        const testCases = [0, 100, 400, 900, 1600, 2500];
        testCases.forEach(xp => {
            const lvl = dbManager.databaseAdapter.calculateLevel(xp);
            const curr = dbManager.databaseAdapter.calculateCurrentXp(xp);
            console.log(`  XP: ${xp} -> Level: ${lvl}, Current XP: ${curr}`);
        });
        
        return true;
    } catch (error) {
        console.error('❌ Level calculation failed:', error.message);
        return false;
    }
}

async function testDatabaseSchema() {
    console.log('📋 Testing database schema...');
    
    try {
        // Check if user_levels table exists
        const tables = await dbManager.databaseAdapter.executeQuery(
            "SHOW TABLES LIKE 'user_levels'"
        );
        
        if (tables.length === 0) {
            console.error('❌ user_levels table does not exist');
            return false;
        }
        
        console.log('✅ user_levels table exists');
        
        // Check table structure
        const structure = await dbManager.databaseAdapter.executeQuery(
            "DESCRIBE user_levels"
        );
        
        console.log('📊 Table structure:');
        structure.forEach(col => {
            console.log(`  ${col.Field}: ${col.Type} ${col.Null === 'YES' ? '(nullable)' : '(not null)'}`);
        });
        
        return true;
    } catch (error) {
        console.error('❌ Database schema test failed:', error.message);
        return false;
    }
}

async function checkExistingUserLevels() {
    console.log('🔍 Checking existing user levels...');
    
    try {
        const users = await dbManager.databaseAdapter.executeQuery(
            "SELECT user_id, level, xp, total_xp FROM user_levels LIMIT 10"
        );
        
        console.log(`📊 Found ${users.length} users with level data:`);
        users.forEach(user => {
            console.log(`  User ${user.user_id}: Level ${user.level}, XP ${user.xp}/${user.total_xp}`);
        });
        
        return true;
    } catch (error) {
        console.error('❌ Failed to check existing users:', error.message);
        return false;
    }
}

async function runAllTests() {
    console.log('🧪 XP System Test Suite');
    console.log('========================');
    
    const tests = [
        { name: 'Database Connection', fn: testDatabaseConnection },
        { name: 'Database Schema', fn: testDatabaseSchema },
        { name: 'Existing User Levels', fn: checkExistingUserLevels },
        { name: 'Level Calculation', fn: testLevelCalculation },
        { name: 'User Level Creation', fn: testUserLevelCreation },
        { name: 'Add XP', fn: testAddXP },
        { name: 'Leveling System Call', fn: testLevelingSystemCall }
    ];
    
    let passed = 0;
    
    for (const test of tests) {
        try {
            const result = await test.fn();
            if (result) passed++;
            console.log('');
        } catch (error) {
            console.error(`❌ Test "${test.name}" crashed:`, error.message);
            console.log('');
        }
    }
    
    console.log('========================');
    console.log(`🎯 Test Results: ${passed}/${tests.length} passed`);
    
    if (passed === tests.length) {
        console.log('🎉 All tests passed! XP system is working correctly.');
    } else {
        console.log('⚠️  Some tests failed. Check the XP system implementation.');
    }
}

// Run tests if this script is executed directly
if (require.main === module) {
    setTimeout(() => {
        runAllTests().then(() => {
            process.exit(0);
        }).catch(error => {
            console.error('Test suite failed:', error);
            process.exit(1);
        });
    }, 3000); // Wait 3 seconds for database to initialize
}

module.exports = { runAllTests };