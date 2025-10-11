/**
 * COMPREHENSIVE MARKET CAP SYSTEM TESTING
 * Tests the $1 trillion monthly cap with dynamic game adjustments
 */

const marketCapManager = require('../UTILS/marketCapManager');
const dynamicGameAdjuster = require('../UTILS/dynamicGameAdjuster');
const { RouletteGame } = require('../GAMES/roulette');
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

async function testMarketCapBasics() {
    console.log('\n🏦 TESTING MARKET CAP BASICS');
    
    try {
        // Test initial state
        const initialStatus = marketCapManager.getMarketStatus();
        logTest('Market manager initialization', 
            initialStatus && typeof initialStatus.adjustmentLevel === 'string', 
            `Level: ${initialStatus.adjustmentLevel}`);
        
        // Test small transaction recording
        await marketCapManager.recordTransaction(1000, 'test', 'test_user');
        const afterSmallTx = marketCapManager.getMarketStatus();
        
        logTest('Small transaction recording',
            afterSmallTx.monthlyVolume === 1000,
            `Volume: $${afterSmallTx.monthlyVolume.toLocaleString()}`);
        
        // Test economic multiplier retrieval
        const multiplier = marketCapManager.getEconomicMultiplier();
        logTest('Economic multiplier retrieval',
            typeof multiplier === 'number' && multiplier > 0,
            `Multiplier: ${multiplier}x`);
        
    } catch (error) {
        logTest('Market cap basics', false, error.message);
    }
}

async function testDynamicAdjustments() {
    console.log('\n⚖️ TESTING DYNAMIC ADJUSTMENTS');
    
    try {
        // Test bet limits adjustment
        const rouletteLimits = dynamicGameAdjuster.getAdjustedBetLimits('roulette');
        logTest('Bet limits adjustment',
            rouletteLimits.min > 0 && rouletteLimits.max > rouletteLimits.min,
            `Min: $${rouletteLimits.min}, Max: $${rouletteLimits.max.toLocaleString()}`);
        
        // Test multiplier adjustments
        const baseMultipliers = { red: 1, black: 1, straight: 35 };
        const adjustedMultipliers = await dynamicGameAdjuster.getAdjustedMultipliers('roulette', baseMultipliers);
        
        logTest('Multiplier adjustments',
            adjustedMultipliers.red > 0 && adjustedMultipliers.straight > 0,
            `Red: ${adjustedMultipliers.red}x, Straight: ${adjustedMultipliers.straight}x`);
        
        // Test UI config generation
        const uiConfig = dynamicGameAdjuster.getGameUIConfig('roulette');
        logTest('UI configuration generation',
            uiConfig && uiConfig.gameType === 'roulette' && uiConfig.betLimits,
            `Theme: ${uiConfig.theme}, Adjustment: ${uiConfig.marketStatus.adjustmentLevel}`);
        
    } catch (error) {
        logTest('Dynamic adjustments', false, error.message);
    }
}

async function testScenarioLowUsage() {
    console.log('\n🟢 TESTING LOW USAGE SCENARIO');
    
    try {
        // Reset to simulate low usage
        await marketCapManager.emergencyReset('test_admin', 'Testing low usage scenario');
        
        // Record small transaction (should trigger LOW adjustment)
        await marketCapManager.recordTransaction(1000000, 'test', 'test_user'); // $1M
        
        const status = marketCapManager.getMarketStatus();
        const multiplier = marketCapManager.getEconomicMultiplier();
        
        logTest('Low usage detection',
            status.monthlyPercentage < 1.0, // Less than 1% of cap
            `Usage: ${status.monthlyPercentage.toFixed(4)}%, Multiplier: ${multiplier}x`);
        
        // Test that multipliers are boosted in low usage
        const adjustedMults = await dynamicGameAdjuster.getAdjustedMultipliers('roulette', { red: 1 });
        logTest('Low usage multiplier boost',
            adjustedMults.red >= 1.0, // Should be boosted or at least maintained
            `Red multiplier: ${adjustedMults.red}x`);
        
    } catch (error) {
        logTest('Low usage scenario', false, error.message);
    }
}

async function testScenarioHighUsage() {
    console.log('\n🟡 TESTING HIGH USAGE SCENARIO');
    
    try {
        // Reset and simulate high usage
        await marketCapManager.emergencyReset('test_admin', 'Testing high usage scenario');
        
        // Record large transaction (should trigger HIGH adjustment)
        const highAmount = 900000000000; // $900 billion (90% of cap)
        await marketCapManager.recordTransaction(highAmount, 'test', 'test_user');
        
        const status = marketCapManager.getMarketStatus();
        const multiplier = marketCapManager.getEconomicMultiplier();
        
        logTest('High usage detection',
            status.monthlyPercentage > 80.0, // More than 80% of cap
            `Usage: ${status.monthlyPercentage.toFixed(2)}%, Multiplier: ${multiplier}x`);
        
        // Test that multipliers are reduced in high usage
        const adjustedMults = await dynamicGameAdjuster.getAdjustedMultipliers('roulette', { red: 1 });
        logTest('High usage multiplier reduction',
            adjustedMults.red < 1.0, // Should be reduced
            `Red multiplier: ${adjustedMults.red}x`);
        
        // Test bet limits are reduced
        const betLimits = dynamicGameAdjuster.getAdjustedBetLimits('roulette');
        logTest('High usage bet limit reduction',
            betLimits.max < 10000, // Should be reduced from normal levels
            `Max bet: $${betLimits.max.toLocaleString()}`);
        
    } catch (error) {
        logTest('High usage scenario', false, error.message);
    }
}

async function testScenarioCriticalUsage() {
    console.log('\n🔴 TESTING CRITICAL USAGE SCENARIO');
    
    try {
        // Reset and simulate critical usage
        await marketCapManager.emergencyReset('test_admin', 'Testing critical usage scenario');
        
        // Record transaction near cap limit
        const criticalAmount = 980000000000; // $980 billion (98% of cap)
        await marketCapManager.recordTransaction(criticalAmount, 'test', 'test_user');
        
        const status = marketCapManager.getMarketStatus();
        const multiplier = marketCapManager.getEconomicMultiplier();
        
        logTest('Critical usage detection',
            status.adjustmentLevel === 'CRITICAL',
            `Level: ${status.adjustmentLevel}, Usage: ${status.monthlyPercentage.toFixed(2)}%`);
        
        // Test that payouts are severely restricted
        logTest('Critical usage severe restrictions',
            multiplier <= 0.2, // Should be severely reduced
            `Economic multiplier: ${multiplier}x`);
        
        // Test transaction near cap is rejected
        const canProcess = await marketCapManager.canProcessTransaction(50000000000); // $50B more
        logTest('Transaction rejection near cap',
            !canProcess.allowed,
            `Reason: ${canProcess.reason}`);
        
    } catch (error) {
        logTest('Critical usage scenario', false, error.message);
    }
}

async function testGameIntegration() {
    console.log('\n🎮 TESTING GAME INTEGRATION');
    
    try {
        // Reset to normal state
        await marketCapManager.emergencyReset('test_admin', 'Testing game integration');
        
        // Test roulette game creation with dynamic limits
        const game = new RouletteGame('test_user', 1000);
        
        logTest('Game creation with dynamic limits',
            game.betLimits && game.uiConfig,
            `Max bet: $${game.betLimits.max.toLocaleString()}, Theme: ${game.uiConfig.theme}`);
        
        // Test bet processing
        const betResult = await dynamicGameAdjuster.processGameBet('test_user', 'roulette', 1000);
        logTest('Bet processing through market cap system',
            betResult.allowed === true,
            betResult.allowed ? 'Bet accepted' : betResult.reason);
        
        // Test payout validation
        const validatedPayout = await dynamicGameAdjuster.validatePayout('roulette', 1000, 2000, 'test_user');
        logTest('Payout validation through market cap system',
            validatedPayout === 2000,
            `Validated payout: $${validatedPayout.toLocaleString()}`);
        
    } catch (error) {
        logTest('Game integration', false, error.message);
    }
}

async function testUIAdjustments() {
    console.log('\n🎨 TESTING UI ADJUSTMENTS');
    
    try {
        // Test different UI configurations for different market states
        const states = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'];
        
        for (const state of states) {
            // Simulate each state
            await marketCapManager.emergencyReset('test_admin', `Testing UI for ${state}`);
            
            // Set appropriate volume for each state
            const volumes = {
                'LOW': 10000000,      // $10M (0.001%)
                'MEDIUM': 500000000000, // $500B (50%)
                'HIGH': 900000000000,   // $900B (90%)
                'CRITICAL': 980000000000 // $980B (98%)
            };
            
            await marketCapManager.recordTransaction(volumes[state], 'test', 'test_user');
            
            const uiConfig = dynamicGameAdjuster.getGameUIConfig('roulette');
            const expectedThemes = {
                'LOW': 'bonus',
                'MEDIUM': 'normal', 
                'HIGH': 'cautious',
                'CRITICAL': 'restricted'
            };
            
            logTest(`UI theme for ${state} market state`,
                uiConfig.theme === expectedThemes[state],
                `Expected: ${expectedThemes[state]}, Got: ${uiConfig.theme}`);
        }
        
    } catch (error) {
        logTest('UI adjustments', false, error.message);
    }
}

async function testEconomyStabilization() {
    console.log('\n📊 TESTING ECONOMY STABILIZATION');
    
    try {
        // Reset and test stabilization over time
        await marketCapManager.emergencyReset('test_admin', 'Testing economy stabilization');
        
        const testTransactions = [
            { amount: 1000000, expected: 'LOW' },      // $1M - should boost economy
            { amount: 100000000000, expected: 'MEDIUM' }, // $100B - should normalize (10% of cap)
            { amount: 400000000000, expected: 'MEDIUM' }, // $400B more (total $500B = 50%) - still medium
            { amount: 400000000000, expected: 'HIGH' }    // $400B more (total $900B = 90%) - should restrict
        ];
        
        let cumulativeVolume = 0;
        
        for (const tx of testTransactions) {
            await marketCapManager.recordTransaction(tx.amount, 'stabilization_test', 'test_user');
            cumulativeVolume += tx.amount;
            
            const status = marketCapManager.getMarketStatus();
            const percentage = (cumulativeVolume / 1000000000000) * 100; // Percentage of $1T
            
            logTest(`Economy adjustment at ${percentage.toFixed(1)}% usage`,
                status.adjustmentLevel === tx.expected,
                `Expected: ${tx.expected}, Got: ${status.adjustmentLevel}, Multiplier: ${status.economicMultiplier}x`);
        }
        
        // Test that the system prevents exceeding the cap
        const finalAttempt = await marketCapManager.canProcessTransaction(200000000000); // $200B more would exceed
        logTest('Final cap enforcement',
            !finalAttempt.allowed,
            `Correctly rejected: ${finalAttempt.reason}`);
        
    } catch (error) {
        logTest('Economy stabilization', false, error.message);
    }
}

async function runComprehensiveMarketCapTests() {
    console.log('🏦 COMPREHENSIVE MARKET CAP SYSTEM TESTING');
    console.log('='.repeat(60));
    
    await testMarketCapBasics();
    await testDynamicAdjustments();
    await testScenarioLowUsage();
    await testScenarioHighUsage();
    await testScenarioCriticalUsage();
    await testGameIntegration();
    await testUIAdjustments();
    await testEconomyStabilization();
    
    console.log('\n' + '='.repeat(60));
    console.log('📊 MARKET CAP SYSTEM TEST SUMMARY');
    console.log(`✅ Passed: ${testResults.passed}`);
    console.log(`❌ Failed: ${testResults.failed}`);
    console.log(`📈 Success Rate: ${((testResults.passed / (testResults.passed + testResults.failed)) * 100).toFixed(1)}%`);
    
    if (testResults.failed > 0) {
        console.log('\n❌ FAILED TESTS:');
        testResults.details.filter(d => d.status === 'FAILED').forEach(detail => {
            console.log(`   • ${detail.test}: ${detail.details}`);
        });
    }
    
    console.log('\n🏦 MARKET CAP SYSTEM STATUS:');
    if (testResults.failed === 0) {
        console.log('🟢 MARKET CAP SYSTEM FULLY OPERATIONAL');
        console.log('🎯 $1 TRILLION MONTHLY CAP ENFORCED');
        console.log('⚖️ DYNAMIC ADJUSTMENTS WORKING');
        console.log('🎮 GAMES INTEGRATED WITH ECONOMY');
        console.log('🎨 UI ADAPTS TO MARKET CONDITIONS');
    } else {
        console.log('🔴 MARKET CAP SYSTEM REQUIRES FIXES');
    }
    
    return testResults;
}

// Export for use in other files
module.exports = { runComprehensiveMarketCapTests, testResults };

// Run tests if called directly
if (require.main === module) {
    runComprehensiveMarketCapTests().then(results => {
        process.exit(results.failed > 0 ? 1 : 0);
    }).catch(error => {
        console.error('❌ Market cap test execution failed:', error.message);
        process.exit(1);
    });
}