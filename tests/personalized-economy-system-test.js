/**
 * COMPREHENSIVE PERSONALIZED ECONOMY SYSTEM TESTING
 * Tests the personalized payout system, economic analysis, and channel logging
 */

const personalizedEconomyManager = require('../UTILS/personalizedEconomyManager');
const dynamicGameAdjuster = require('../UTILS/dynamicGameAdjuster');
const marketCapManager = require('../UTILS/marketCapManager');
const economyChannelLogger = require('../UTILS/economyChannelLogger');
const logger = require('../UTILS/logger');

const testResults = {
    passed: 0,
    failed: 0,
    details: []
};

function logTest(testName, passed, details = '') {
    testResults.details.push({
        test: testName,
        status: passed ? 'PASSED' : 'FAILED',
        details: details
    });
    
    if (passed) {
        testResults.passed++;
        console.log(`✅ ${testName}: PASSED ${details}`);
    } else {
        testResults.failed++;
        console.log(`❌ ${testName}: FAILED ${details}`);
    }
}

async function testPersonalizedEconomyBasics() {
    console.log('\n👤 TESTING PERSONALIZED ECONOMY BASICS');
    
    try {
        // Test initial user state (should be MINIMAL impact)
        const initialMultiplier = await personalizedEconomyManager.getUserPayoutMultiplier('test_user_1');
        const initialLevel = await personalizedEconomyManager.getUserImpactLevel('test_user_1');
        const initialScore = await personalizedEconomyManager.getUserEconomicScore('test_user_1');
        
        logTest('New user gets bonus multiplier',
            initialMultiplier === 2.0 && initialLevel === 'MINIMAL',
            `Multiplier: ${initialMultiplier}x, Level: ${initialLevel}, Score: ${initialScore}`);
        
        // Test recording a bet
        await personalizedEconomyManager.recordUserBet('test_user_1', 'roulette', 1000);
        
        const afterBetMultiplier = await personalizedEconomyManager.getUserPayoutMultiplier('test_user_1');
        const afterBetLevel = await personalizedEconomyManager.getUserImpactLevel('test_user_1');
        
        logTest('User bet recording and impact calculation',
            typeof afterBetMultiplier === 'number' && typeof afterBetLevel === 'string',
            `New multiplier: ${afterBetMultiplier}x, Level: ${afterBetLevel}`);
        
    } catch (error) {
        logTest('Personalized economy basics', false, error.message);
    }
}

async function testImpactLevelProgression() {
    console.log('\n📈 TESTING IMPACT LEVEL PROGRESSION');
    
    try {
        const testUsers = [
            { id: 'casual_user', volume: 200000000, expectedLevel: 'CASUAL' },      // $200M
            { id: 'regular_user', volume: 2000000000, expectedLevel: 'REGULAR' },   // $2B
            { id: 'high_roller', volume: 20000000000, expectedLevel: 'HIGH_ROLLER' }, // $20B
            { id: 'whale_user', volume: 60000000000, expectedLevel: 'WHALE' }       // $60B
        ];
        
        for (const user of testUsers) {
            // Simulate progression through multiple bets
            const betCount = Math.ceil(user.volume / 10000000); // $10M per bet
            const betSize = user.volume / betCount;
            
            for (let i = 0; i < betCount; i++) {
                await personalizedEconomyManager.recordUserBet(user.id, 'roulette', betSize);
            }
            
            const finalLevel = await personalizedEconomyManager.getUserImpactLevel(user.id);
            const finalMultiplier = await personalizedEconomyManager.getUserPayoutMultiplier(user.id);
            
            logTest(`${user.id} reaches ${user.expectedLevel} level`,
                finalLevel === user.expectedLevel,
                `Expected: ${user.expectedLevel}, Got: ${finalLevel}, Multiplier: ${finalMultiplier}x`);
        }
        
    } catch (error) {
        logTest('Impact level progression', false, error.message);
    }
}

async function testPersonalizedPayouts() {
    console.log('\n💰 TESTING PERSONALIZED PAYOUTS');
    
    try {
        // Test different payout multipliers
        const testCases = [
            { userId: 'casual_user', basePayout: 10000, expectedRange: [7000, 10000] }, // Should be normal or slightly reduced
            { userId: 'regular_user', basePayout: 10000, expectedRange: [5000, 8000] }, // Should be reduced
            { userId: 'high_roller', basePayout: 10000, expectedRange: [2000, 4000] }, // Should be heavily reduced
            { userId: 'whale_user', basePayout: 10000, expectedRange: [500, 1500] }    // Should be severely reduced
        ];
        
        for (const testCase of testCases) {
            const adjustedPayout = await dynamicGameAdjuster.validatePayout(
                'roulette', 
                1000, 
                testCase.basePayout, 
                testCase.userId
            );
            
            const inExpectedRange = adjustedPayout >= testCase.expectedRange[0] && 
                                  adjustedPayout <= testCase.expectedRange[1];
            
            logTest(`${testCase.userId} personalized payout`,
                inExpectedRange,
                `Base: $${testCase.basePayout}, Adjusted: $${adjustedPayout}, Expected: $${testCase.expectedRange[0]}-${testCase.expectedRange[1]}`);
        }
        
    } catch (error) {
        logTest('Personalized payouts', false, error.message);
    }
}

async function testBetLimitRemoval() {
    console.log('\n🚫 TESTING BET LIMIT REMOVAL');
    
    try {
        // Test that bet limits are now unlimited
        const betLimits = dynamicGameAdjuster.getAdjustedBetLimits('roulette');
        
        logTest('Bet limits removed (unlimited betting)',
            betLimits.min === 1 && betLimits.max === Number.MAX_SAFE_INTEGER,
            `Min: $${betLimits.min}, Max: ${betLimits.max === Number.MAX_SAFE_INTEGER ? 'Unlimited' : betLimits.max}`);
        
        // Test massive bet processing
        const massiveBetResult = await dynamicGameAdjuster.processGameBet('test_whale', 'roulette', 1000000000); // $1B bet
        
        logTest('Massive bet processing (no bet limit restrictions)',
            massiveBetResult.allowed === true,
            massiveBetResult.allowed ? 'Massive bet accepted' : massiveBetResult.message);
        
    } catch (error) {
        logTest('Bet limit removal', false, error.message);
    }
}

async function testEconomicAnalysis() {
    console.log('\n🔬 TESTING ECONOMIC ANALYSIS SYSTEM');
    
    try {
        // Test economic report generation
        const economicReport = await personalizedEconomyManager.getEconomicReport();
        
        logTest('Economic report generation',
            economicReport.totalUsers > 0 && 
            typeof economicReport.houseEdge === 'number' &&
            Array.isArray(economicReport.leaderboard),
            `Users: ${economicReport.totalUsers}, House Edge: ${economicReport.houseEdge.toFixed(2)}%, Leaderboard entries: ${economicReport.leaderboard.length}`);
        
        // Test detailed market report with personalized data
        const marketReport = await dynamicGameAdjuster.getDetailedMarketReport();
        
        logTest('Detailed market report with personalized economy',
            marketReport.personalizedEconomy && 
            marketReport.personalizedEconomy.enabled === true &&
            marketReport.economicReport,
            `Personalized: ${marketReport.personalizedEconomy.enabled}, Analysis Interval: ${marketReport.personalizedEconomy.analysisInterval}`);
        
    } catch (error) {
        logTest('Economic analysis system', false, error.message);
    }
}

async function testChannelLogging() {
    console.log('\n📝 TESTING CHANNEL LOGGING SYSTEM');
    
    try {
        // Test queue status
        const queueStatus = economyChannelLogger.getQueueStatus();
        
        logTest('Channel logger initialization',
            typeof queueStatus.queueSize === 'number' &&
            typeof queueStatus.isProcessing === 'boolean',
            `Queue size: ${queueStatus.queueSize}, Processing: ${queueStatus.isProcessing}, Max size: ${queueStatus.maxQueueSize}`);
        
        // Test log queuing
        const initialQueueSize = queueStatus.queueSize;
        
        economyChannelLogger.logUserBet('test_user', 'roulette', 1000, {
            impactLevel: 'MINIMAL',
            economicScore: 0.1,
            payoutMultiplier: 2.0
        });
        
        const afterLogStatus = economyChannelLogger.getQueueStatus();
        
        logTest('Log queuing functionality',
            afterLogStatus.queueSize > initialQueueSize,
            `Queue grew from ${initialQueueSize} to ${afterLogStatus.queueSize} entries`);
        
        // Test different log types
        economyChannelLogger.logPersonalizedAdjustment('test_user', 'MINIMAL', 'CASUAL', 2.0, 1.0, 'Volume threshold reached');
        economyChannelLogger.logMarketChange('MEDIUM', 'HIGH', '75.2', 0.5, 1500000000000);
        economyChannelLogger.logEconomicAnalysis('Scheduled', 100, 5, 'Market stable with moderate activity');
        
        const finalQueueStatus = economyChannelLogger.getQueueStatus();
        
        logTest('Multiple log type queuing',
            finalQueueStatus.queueSize >= afterLogStatus.queueSize + 3,
            `Queue contains ${finalQueueStatus.queueSize} log entries`);
        
    } catch (error) {
        logTest('Channel logging system', false, error.message);
    }
}

async function testMarketCapIntegration() {
    console.log('\n🏦 TESTING MARKET CAP INTEGRATION');
    
    try {
        // Test that market cap is now $2T
        const marketStatus = marketCapManager.getMarketStatus();
        const expectedMonthlyCapTrillion = 2.0; // $2 trillion
        const actualMonthlyCapTrillion = marketCapManager.MONTHLY_MARKET_CAP / 1000000000000;
        
        logTest('Market cap updated to $2 trillion',
            actualMonthlyCapTrillion === expectedMonthlyCapTrillion,
            `Expected: $${expectedMonthlyCapTrillion}T, Actual: $${actualMonthlyCapTrillion}T`);
        
        // Test UI adjustments no longer mention bet limits
        const uiAdjustments = marketCapManager.getUIAdjustments();
        
        logTest('UI adjustments updated for personalized system',
            !uiAdjustments.warning?.includes('bet') && uiAdjustments.warning?.includes('payouts'),
            `Warning message: "${uiAdjustments.warning}"`);
        
        // Test game UI config includes personalized info
        const uiConfig = await dynamicGameAdjuster.getGameUIConfig('roulette', 'test_user');
        
        logTest('Game UI config includes personalized information',
            uiConfig.personalizedInfo !== null || uiConfig.betLimits.max === Number.MAX_SAFE_INTEGER,
            `Personalized info present: ${uiConfig.personalizedInfo !== null}, Unlimited betting: ${uiConfig.betLimits.max === Number.MAX_SAFE_INTEGER}`);
        
    } catch (error) {
        logTest('Market cap integration', false, error.message);
    }
}

async function testSystemStability() {
    console.log('\n⚡ TESTING SYSTEM STABILITY');
    
    try {
        // Test rapid transaction processing
        const rapidTransactions = [];
        const startTime = Date.now();
        
        for (let i = 0; i < 10; i++) {
            const promise = personalizedEconomyManager.recordUserBet(`stress_user_${i}`, 'roulette', 100000);
            rapidTransactions.push(promise);
        }
        
        await Promise.all(rapidTransactions);
        const processingTime = Date.now() - startTime;
        
        logTest('Rapid transaction processing',
            processingTime < 5000, // Should process 10 transactions in under 5 seconds
            `Processed 10 transactions in ${processingTime}ms`);
        
        // Test error handling with invalid data
        try {
            await personalizedEconomyManager.recordUserBet(null, 'roulette', 1000);
            logTest('Error handling for invalid user ID', false, 'Should have thrown error');
        } catch (error) {
            logTest('Error handling for invalid user ID', true, `Correctly caught error: ${error.message}`);
        }
        
        // Test memory usage doesn't grow excessively
        const userCount = personalizedEconomyManager.userImpactData.size;
        logTest('Memory management (user data tracking)',
            userCount < 1000, // Should not accumulate excessive test users
            `Tracking ${userCount} users in memory`);
        
    } catch (error) {
        logTest('System stability', false, error.message);
    }
}

async function testSecurityMeasures() {
    console.log('\n🛡️ TESTING SECURITY MEASURES');
    
    try {
        // Test that extreme values are handled safely
        const extremeMultiplier = await personalizedEconomyManager.getUserPayoutMultiplier('whale_user');
        
        logTest('Extreme payout multipliers are capped',
            extremeMultiplier >= 0.01 && extremeMultiplier <= 5.0, // Should be within reasonable bounds
            `Whale multiplier: ${extremeMultiplier}x (should be 0.01-5.0x range)`);
        
        // Test payout validation prevents negative amounts
        try {
            await dynamicGameAdjuster.validatePayout('roulette', 1000, -5000, 'test_user');
            logTest('Negative payout prevention', false, 'Should have rejected negative payout');
        } catch (error) {
            logTest('Negative payout prevention', true, `Correctly rejected: ${error.message}`);
        }
        
        // Test that payouts have minimum floor
        const minPayout = await dynamicGameAdjuster.validatePayout('roulette', 10000, 100000, 'whale_user');
        const minimumFloor = 10000 * 0.01; // Should be at least 1% of base bet
        
        logTest('Minimum payout floor protection',
            minPayout >= minimumFloor,
            `Whale payout: $${minPayout} (minimum: $${minimumFloor})`);
        
    } catch (error) {
        logTest('Security measures', false, error.message);
    }
}

async function runComprehensivePersonalizedEconomyTests() {
    console.log('💎 COMPREHENSIVE PERSONALIZED ECONOMY SYSTEM TESTING');
    console.log('='.repeat(70));
    
    await testPersonalizedEconomyBasics();
    await testImpactLevelProgression();
    await testPersonalizedPayouts();
    await testBetLimitRemoval();
    await testEconomicAnalysis();
    await testChannelLogging();
    await testMarketCapIntegration();
    await testSystemStability();
    await testSecurityMeasures();
    
    console.log('\n' + '='.repeat(70));
    console.log('📊 PERSONALIZED ECONOMY SYSTEM TEST SUMMARY');
    console.log(`✅ Passed: ${testResults.passed}`);
    console.log(`❌ Failed: ${testResults.failed}`);
    console.log(`📈 Success Rate: ${((testResults.passed / (testResults.passed + testResults.failed)) * 100).toFixed(1)}%`);
    
    if (testResults.failed > 0) {
        console.log('\n❌ FAILED TESTS:');
        testResults.details.filter(d => d.status === 'FAILED').forEach(detail => {
            console.log(`   • ${detail.test}: ${detail.details}`);
        });
    }
    
    console.log('\n💎 PERSONALIZED ECONOMY SYSTEM STATUS:');
    if (testResults.failed === 0) {
        console.log('🟢 PERSONALIZED ECONOMY SYSTEM FULLY OPERATIONAL');
        console.log('🎯 BET LIMITS REMOVED - UNLIMITED BETTING ENABLED');
        console.log('👤 PERSONALIZED PAYOUTS BASED ON ECONOMIC IMPACT');
        console.log('💰 $2 TRILLION MONTHLY CAP ENFORCED');
        console.log('📊 CONTINUOUS DEEP ANALYSIS SYSTEM ACTIVE');
        console.log('📝 COMPREHENSIVE DISCORD CHANNEL LOGGING');
        console.log('⚖️ DYNAMIC MARKET ADJUSTMENTS WORKING');
        console.log('🛡️ SECURITY MEASURES IN PLACE');
    } else if (testResults.failed < 3) {
        console.log('🟡 PERSONALIZED ECONOMY SYSTEM MOSTLY OPERATIONAL');
        console.log('⚠️ MINOR ISSUES DETECTED - SYSTEM FUNCTIONAL');
    } else {
        console.log('🔴 PERSONALIZED ECONOMY SYSTEM REQUIRES ATTENTION');
        console.log('❗ MULTIPLE ISSUES DETECTED - REVIEW NEEDED');
    }
    
    return testResults;
}

// Export for use in other files
module.exports = { runComprehensivePersonalizedEconomyTests, testResults };

// Run tests if called directly
if (require.main === module) {
    runComprehensivePersonalizedEconomyTests().then(results => {
        process.exit(results.failed > 0 ? 1 : 0);
    }).catch(error => {
        console.error('❌ Personalized economy test execution failed:', error.message);
        process.exit(1);
    });
}