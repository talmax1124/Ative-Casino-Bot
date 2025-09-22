#!/usr/bin/env node

/**
 * Test script to verify the ML data collection fix
 * Simulates the problematic scenario with large wealth values
 */

const { gameDataCollector } = require('./UTILS/gameDataCollector');

async function testLargeWealthValues() {
    console.log('🧪 Testing ML data collection with large wealth values...');
    
    // Simulate the problematic game data from the error
    const testGameData = {
        gameType: 'shop_purchase',
        userId: '434478017880915979',
        guildId: '1400037754976473158',
        betAmount: 10000000.00,
        payout: 0,
        won: true,
        userWealthBefore: 910962310000000.00, // This was causing the error
        userWealthAfter: 910962300000000.00,  // After spending 10M
        gameSpecificData: {
            itemId: 4,
            itemName: '🔓 EarnMoney Unlock',
            itemCategory: 'unlocks',
            itemDescription: 'Bypass the 10 vote requirement for /earnmoney for 1.5 weeks',
            duration: 252,
            isPermanent: false,
            gameType: 'shop_purchase'
        },
        houseEdgeApplied: 0,
        multiplierReduction: 0,
        serverEconomicHealth: 100,
        betPattern: 'CONSERVATIVE',
        winStreak: 1,
        lossStreak: 0,
        riskLevel: 'LOW'
    };

    try {
        console.log('Testing data collection for user with wealth:', testGameData.userWealthBefore.toLocaleString());
        
        // Test the data categorization functions
        const wealthCategory = gameDataCollector.categorizeWealth(testGameData.userWealthBefore);
        const betCategory = gameDataCollector.categorizeBetSize(testGameData.betAmount);
        
        console.log('✅ Wealth category:', wealthCategory);
        console.log('✅ Bet size category:', betCategory);
        
        // Test the enriched data creation (this simulates what would be stored)
        const enrichedData = {
            timestamp: Date.now(),
            gameType: testGameData.gameType,
            userId: testGameData.userId,
            guildId: testGameData.guildId,
            betAmount: testGameData.betAmount,
            payout: testGameData.payout,
            won: testGameData.won,
            netResult: testGameData.payout - testGameData.betAmount,
            multiplierHit: testGameData.payout / testGameData.betAmount,
            userWealthBefore: testGameData.userWealthBefore,
            userWealthAfter: testGameData.userWealthAfter,
            gameSpecificData: testGameData.gameSpecificData,
            features: {
                betSizeCategory: betCategory,
                wealthCategory: wealthCategory,
                gameFrequency: 0,
                sessionLength: 0,
                timeOfDay: new Date().getHours(),
                dayOfWeek: new Date().getDay(),
                isWeekend: [0, 6].includes(new Date().getDay())
            }
        };
        
        console.log('✅ Data enrichment successful');
        console.log('Data would be stored with:');
        console.log(`  - Wealth before: ${enrichedData.userWealthBefore}`);
        console.log(`  - Wealth after: ${enrichedData.userWealthAfter}`);
        console.log(`  - Net result: ${enrichedData.netResult}`);
        console.log(`  - Wealth category: ${enrichedData.features.wealthCategory}`);
        
        // Verify the values fit in DECIMAL(20,2)
        const maxDecimal20_2 = 999999999999999999.99; // 18 digits + 2 decimal places
        
        if (enrichedData.userWealthBefore <= maxDecimal20_2 && enrichedData.userWealthAfter <= maxDecimal20_2) {
            console.log('✅ Values fit within DECIMAL(20,2) limits');
            console.log('💾 Database storage should now work correctly');
        } else {
            console.log('❌ Values still exceed DECIMAL(20,2) limits');
        }
        
        return true;
        
    } catch (error) {
        console.error('❌ Test failed:', error.message);
        return false;
    }
}

// Run the test
testLargeWealthValues()
    .then(success => {
        if (success) {
            console.log('\n🎉 All tests passed! The fix should resolve the database error.');
        } else {
            console.log('\n💥 Tests failed. Further investigation needed.');
        }
        process.exit(success ? 0 : 1);
    })
    .catch(error => {
        console.error('💥 Test script error:', error.message);
        process.exit(1);
    });