/**
 * QUICK PERSONALIZED ECONOMY SYSTEM TEST
 * Fast validation of core personalized economy functionality
 */

const personalizedEconomyManager = require('../UTILS/personalizedEconomyManager');
const dynamicGameAdjuster = require('../UTILS/dynamicGameAdjuster');
const marketCapManager = require('../UTILS/marketCapManager');
const economyChannelLogger = require('../UTILS/economyChannelLogger');

async function runQuickTests() {
    console.log('🚀 QUICK PERSONALIZED ECONOMY SYSTEM TEST');
    console.log('='.repeat(50));
    
    let passed = 0;
    let failed = 0;
    
    // Test 1: Basic functionality
    try {
        const multiplier = await personalizedEconomyManager.getUserPayoutMultiplier('new_user');
        const level = await personalizedEconomyManager.getUserImpactLevel('new_user');
        
        if (multiplier === 2.0 && level === 'MINIMAL') {
            console.log('✅ New user bonus system');
            passed++;
        } else {
            console.log('❌ New user bonus system');
            failed++;
        }
    } catch (error) {
        console.log('❌ New user bonus system - Error:', error.message);
        failed++;
    }
    
    // Test 2: Bet limits removed
    try {
        const betLimits = dynamicGameAdjuster.getAdjustedBetLimits('roulette');
        
        if (betLimits.max === Number.MAX_SAFE_INTEGER) {
            console.log('✅ Bet limits removed (unlimited betting)');
            passed++;
        } else {
            console.log('❌ Bet limits not properly removed');
            failed++;
        }
    } catch (error) {
        console.log('❌ Bet limit removal - Error:', error.message);
        failed++;
    }
    
    // Test 3: Market cap at $2T
    try {
        const expectedCap = 2000000000000; // $2 trillion
        
        if (marketCapManager.MONTHLY_MARKET_CAP === expectedCap) {
            console.log('✅ Market cap set to $2 trillion');
            passed++;
        } else {
            console.log('❌ Market cap not set to $2 trillion');
            failed++;
        }
    } catch (error) {
        console.log('❌ Market cap check - Error:', error.message);
        failed++;
    }
    
    // Test 4: Channel logger functionality
    try {
        const status = economyChannelLogger.getQueueStatus();
        
        if (typeof status.queueSize === 'number' && status.maxQueueSize === 1000) {
            console.log('✅ Channel logging system initialized');
            passed++;
        } else {
            console.log('❌ Channel logging system not properly initialized');
            failed++;
        }
    } catch (error) {
        console.log('❌ Channel logging - Error:', error.message);
        failed++;
    }
    
    // Test 5: Game integration
    try {
        const betResult = await dynamicGameAdjuster.processGameBet('test_user', 'roulette', 1000000);
        
        if (betResult.allowed && betResult.personalizedInfo) {
            console.log('✅ Game integration with personalized system');
            passed++;
        } else {
            console.log('❌ Game integration incomplete');
            failed++;
        }
    } catch (error) {
        console.log('❌ Game integration - Error:', error.message);
        failed++;
    }
    
    // Test 6: Payout validation
    try {
        const adjustedPayout = await dynamicGameAdjuster.validatePayout('roulette', 1000, 2000, 'test_user');
        
        if (typeof adjustedPayout === 'number' && adjustedPayout > 0) {
            console.log('✅ Personalized payout validation');
            passed++;
        } else {
            console.log('❌ Personalized payout validation failed');
            failed++;
        }
    } catch (error) {
        console.log('❌ Payout validation - Error:', error.message);
        failed++;
    }
    
    // Test 7: Economic reporting
    try {
        const report = await personalizedEconomyManager.getEconomicReport();
        
        if (report.totalUsers >= 0 && typeof report.houseEdge === 'number') {
            console.log('✅ Economic reporting system');
            passed++;
        } else {
            console.log('❌ Economic reporting system failed');
            failed++;
        }
    } catch (error) {
        console.log('❌ Economic reporting - Error:', error.message);
        failed++;
    }
    
    // Test 8: Security measures
    try {
        const result = await dynamicGameAdjuster.validatePayout('roulette', 1000, -1000, 'test_user');
        console.log('❌ Security validation failed - negative payout allowed');
        failed++;
    } catch (error) {
        console.log('✅ Security validation (negative payouts blocked)');
        passed++;
    }
    
    console.log('\n' + '='.repeat(50));
    console.log(`📊 TEST RESULTS: ${passed} passed, ${failed} failed`);
    console.log(`📈 Success Rate: ${((passed / (passed + failed)) * 100).toFixed(1)}%`);
    
    if (failed === 0) {
        console.log('\n🎉 ALL SYSTEMS OPERATIONAL');
        console.log('✅ Personalized economy system fully deployed');
        console.log('✅ Bet limits removed - unlimited betting enabled');
        console.log('✅ $2T monthly market cap active');
        console.log('✅ Discord channel logging ready');
        console.log('✅ Deep economic analysis running');
        console.log('✅ Security measures in place');
    } else {
        console.log('\n⚠️ SOME ISSUES DETECTED');
        console.log('Please review failed tests above');
    }
    
    return { passed, failed, totalTests: passed + failed };
}

// Run if called directly
if (require.main === module) {
    runQuickTests().then(results => {
        process.exit(results.failed > 0 ? 1 : 0);
    }).catch(error => {
        console.error('❌ Test execution failed:', error.message);
        process.exit(1);
    });
}

module.exports = { runQuickTests };