/**
 * COMPREHENSIVE SECURITY FIXES VERIFICATION
 * Tests all the fixes applied to resolve critical vulnerabilities
 */

const logger = require('../UTILS/logger');
const GameInputValidator = require('../UTILS/gameInputValidator');

// Import game classes for testing
const { RouletteGame } = require('../GAMES/roulette');
const { Card, BlackjackGame } = require('../GAMES/blackjack');
const { PlinkoGameSession } = require('../GAMES/plinko');
const { CrashGame } = require('../GAMES/crash');

const testResults = {
    passed: 0,
    failed: 0,
    details: []
};

function logResult(testName, passed, details = '') {
    testResults.details.push({
        test: testName,
        status: passed ? 'PASSED' : 'FAILED',
        details: details
    });
    
    if (passed) {
        testResults.passed++;
        console.log(`✅ ${testName}: PASSED`);
    } else {
        testResults.failed++;
        console.log(`❌ ${testName}: FAILED - ${details}`);
    }
}

async function testInputValidation() {
    console.log('\n🔍 TESTING INPUT VALIDATION');
    
    // Test bet amount validation
    try {
        GameInputValidator.validateBetAmount(100);
        logResult('Valid bet amount acceptance', true);
    } catch (error) {
        logResult('Valid bet amount acceptance', false, error.message);
    }
    
    // Test invalid bet amounts
    const invalidBets = [
        { value: -100, name: 'Negative bet amount' },
        { value: NaN, name: 'NaN bet amount' },
        { value: Infinity, name: 'Infinity bet amount' },
        { value: 0, name: 'Zero bet amount' },
        { value: 'invalid', name: 'String bet amount' }
    ];
    
    for (const invalidBet of invalidBets) {
        try {
            GameInputValidator.validateBetAmount(invalidBet.value);
            logResult(`${invalidBet.name} rejection`, false, 'Should have thrown error');
        } catch (error) {
            logResult(`${invalidBet.name} rejection`, true);
        }
    }
    
    // Test roulette outcome validation
    try {
        GameInputValidator.validateRouletteOutcome(15);
        logResult('Valid roulette outcome acceptance', true);
    } catch (error) {
        logResult('Valid roulette outcome acceptance', false, error.message);
    }
    
    // Test invalid roulette outcomes
    const invalidOutcomes = ['invalid', 37, -1, '01', '0x10'];
    for (const outcome of invalidOutcomes) {
        try {
            GameInputValidator.validateRouletteOutcome(outcome);
            logResult(`Invalid roulette outcome ${outcome} rejection`, false, 'Should have thrown error');
        } catch (error) {
            logResult(`Invalid roulette outcome ${outcome} rejection`, true);
        }
    }
    
    // Test card validation
    try {
        GameInputValidator.validateCardRank('K');
        GameInputValidator.validateCardSuit('♠️');
        logResult('Valid card validation', true);
    } catch (error) {
        logResult('Valid card validation', false, error.message);
    }
    
    // Test invalid cards
    try {
        GameInputValidator.validateCardRank('Z');
        logResult('Invalid card rank rejection', false, 'Should have thrown error');
    } catch (error) {
        logResult('Invalid card rank rejection', true);
    }
}

async function testRouletteSecurityFixes() {
    console.log('\n🎰 TESTING ROULETTE SECURITY FIXES');
    
    // Test valid roulette game creation and validation
    try {
        const game = new RouletteGame('123456789', 100);
        logResult('Roulette game creation with valid bet', true);
        
        // Test that validation methods work (the main security fixes)
        game.validateBetAmount(100);
        game.validateOutcome(15);
        logResult('Roulette validation methods work correctly', true);
        
    } catch (error) {
        logResult('Roulette security validation', false, error.message);
    }
    
    // Test invalid bet amount rejection
    try {
        new RouletteGame('123456789', -100);
        logResult('Roulette invalid bet rejection', false, 'Should have thrown error');
    } catch (error) {
        logResult('Roulette invalid bet rejection', true);
    }
}

async function testBlackjackSecurityFixes() {
    console.log('\n🃏 TESTING BLACKJACK SECURITY FIXES');
    
    try {
        // Test valid card creation
        const card = new Card('A', '♠️');
        if (card.rank === 'A' && card.suit === '♠️') {
            logResult('Blackjack valid card creation', true);
        } else {
            logResult('Blackjack valid card creation', false, 'Card properties incorrect');
        }
        
        // Test card value calculation
        const value = card.getValue();
        if (value === 11) {
            logResult('Blackjack card value calculation', true);
        } else {
            logResult('Blackjack card value calculation', false, `Expected 11, got ${value}`);
        }
        
    } catch (error) {
        logResult('Blackjack valid card tests', false, error.message);
    }
    
    // Test invalid card creation
    try {
        new Card('Z', '♠️');
        logResult('Blackjack invalid card rejection', false, 'Should have thrown error');
    } catch (error) {
        logResult('Blackjack invalid card rejection', true);
    }
    
    try {
        new Card('A', '🔥');
        logResult('Blackjack invalid suit rejection', false, 'Should have thrown error');
    } catch (error) {
        logResult('Blackjack invalid suit rejection', true);
    }
    
    try {
        // Test valid blackjack game creation
        const game = new BlackjackGame('123456789', 100, null, 10000);
        if (game.betAmount === 100) {
            logResult('Blackjack game creation', true);
        } else {
            logResult('Blackjack game creation', false, 'Bet amount not set correctly');
        }
    } catch (error) {
        logResult('Blackjack game creation', false, error.message);
    }
}

async function testPlinkoSecurityFixes() {
    console.log('\n🏓 TESTING PLINKO SECURITY FIXES');
    
    try {
        // Test valid plinko game creation
        const game = new PlinkoGameSession('123456789', 'TestUser', 100, 'channel123', 'easy', 10000);
        if (game.betAmount === 100) {
            logResult('Plinko game creation', true);
        } else {
            logResult('Plinko game creation', false, 'Bet amount not set correctly');
        }
        
        // Test multiplier validation
        const multipliers = await game.getFinalMultipliers();
        if (Array.isArray(multipliers) && multipliers.length === 9) {
            // Check all multipliers are capped at 3.0
            const allValidMultipliers = multipliers.every(m => 
                Number.isFinite(m) && m >= 0 && m <= 3.0
            );
            logResult('Plinko multiplier cap enforcement', allValidMultipliers, 
                allValidMultipliers ? '' : `Invalid multipliers: ${multipliers.join(', ')}`);
        } else {
            logResult('Plinko multiplier validation', false, 'Invalid multipliers array');
        }
        
        // Test position validation
        GameInputValidator.validatePlinkoPosition(5);
        logResult('Plinko valid position acceptance', true);
        
    } catch (error) {
        logResult('Plinko security tests', false, error.message);
    }
    
    // Test invalid position rejection
    try {
        GameInputValidator.validatePlinkoPosition(0);
        logResult('Plinko invalid position rejection', false, 'Should have thrown error');
    } catch (error) {
        logResult('Plinko invalid position rejection', true);
    }
}

async function testMultiplierCaps() {
    console.log('\n🔒 TESTING MULTIPLIER CAPS');
    
    // Test multiplier validation
    try {
        GameInputValidator.validateMultiplier(2.5, 0, 3.0);
        logResult('Valid multiplier acceptance', true);
    } catch (error) {
        logResult('Valid multiplier acceptance', false, error.message);
    }
    
    // Test excessive multiplier rejection
    try {
        GameInputValidator.validateMultiplier(10.0, 0, 3.0);
        logResult('Excessive multiplier rejection', false, 'Should have thrown error');
    } catch (error) {
        logResult('Excessive multiplier rejection', true);
    }
    
    // Test payout validation
    try {
        GameInputValidator.validatePayout(100, 2.0, 200);
        logResult('Valid payout calculation', true);
    } catch (error) {
        logResult('Valid payout calculation', false, error.message);
    }
    
    // Test invalid payout rejection
    try {
        GameInputValidator.validatePayout(100, 2.0, 1000);
        logResult('Invalid payout rejection', false, 'Should have thrown error');
    } catch (error) {
        logResult('Invalid payout rejection', true);
    }
}

async function testTimestampValidation() {
    console.log('\n⏰ TESTING TIMESTAMP VALIDATION');
    
    // Test valid timestamp
    try {
        GameInputValidator.validateTimestamp(Date.now());
        logResult('Valid timestamp acceptance', true);
    } catch (error) {
        logResult('Valid timestamp acceptance', false, error.message);
    }
    
    // Test old timestamp rejection
    try {
        GameInputValidator.validateTimestamp(Date.now() - 20000); // 20 seconds old
        logResult('Old timestamp rejection', false, 'Should have thrown error');
    } catch (error) {
        logResult('Old timestamp rejection', true);
    }
    
    // Test future timestamp rejection
    try {
        GameInputValidator.validateTimestamp(Date.now() + 5000); // 5 seconds in future
        logResult('Future timestamp rejection', false, 'Should have thrown error');
    } catch (error) {
        logResult('Future timestamp rejection', true);
    }
}

async function runAllTests() {
    console.log('🔍 COMPREHENSIVE SECURITY FIXES VERIFICATION');
    console.log('='.repeat(50));
    
    await testInputValidation();
    await testRouletteSecurityFixes();
    await testBlackjackSecurityFixes();
    await testPlinkoSecurityFixes();
    await testMultiplierCaps();
    await testTimestampValidation();
    
    console.log('\n' + '='.repeat(50));
    console.log('📊 TEST SUMMARY');
    console.log(`✅ Passed: ${testResults.passed}`);
    console.log(`❌ Failed: ${testResults.failed}`);
    console.log(`📈 Success Rate: ${((testResults.passed / (testResults.passed + testResults.failed)) * 100).toFixed(1)}%`);
    
    if (testResults.failed > 0) {
        console.log('\n❌ FAILED TESTS:');
        testResults.details.filter(d => d.status === 'FAILED').forEach(detail => {
            console.log(`   • ${detail.test}: ${detail.details}`);
        });
    }
    
    console.log('\n🔒 SECURITY STATUS:');
    if (testResults.failed === 0) {
        console.log('🟢 ALL SECURITY FIXES VERIFIED - SYSTEM SECURE');
    } else {
        console.log('🔴 SECURITY ISSUES DETECTED - IMMEDIATE ATTENTION REQUIRED');
    }
    
    return testResults;
}

// Export for use in other test files
module.exports = { runAllTests, testResults };

// Run tests if called directly
if (require.main === module) {
    runAllTests().then(results => {
        process.exit(results.failed > 0 ? 1 : 0);
    }).catch(error => {
        console.error('❌ Test execution failed:', error.message);
        process.exit(1);
    });
}