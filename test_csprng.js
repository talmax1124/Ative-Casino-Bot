/**
 * CSPRNG Statistical Test Suite
 * Tests the advanced cryptographically secure random number generator
 */

const { 
    secureRandomInt, 
    secureRandomFloat, 
    generateProvablyFairRandom,
    generateAntiStreakRandom,
    generateVolatilityAdjustedRandom,
    getCSPRNGStatistics,
    secureWeightedChoice
} = require('./UTILS/rng');

// Test configuration
const TEST_CONFIG = {
    SAMPLE_SIZE: 10000,
    DICE_ROLLS: 1000,
    STATISTICAL_THRESHOLD: 0.05 // 5% significance level
};

/**
 * Chi-Square Test for Uniformity
 */
function chiSquareTest(samples, expectedFrequency) {
    const frequencies = {};
    samples.forEach(sample => {
        frequencies[sample] = (frequencies[sample] || 0) + 1;
    });
    
    let chiSquare = 0;
    const uniqueValues = Object.keys(frequencies);
    
    uniqueValues.forEach(value => {
        const observed = frequencies[value];
        const expected = expectedFrequency;
        chiSquare += Math.pow(observed - expected, 2) / expected;
    });
    
    return {
        chiSquare,
        degreesOfFreedom: uniqueValues.length - 1,
        frequencies
    };
}

/**
 * Test basic random integer generation
 */
function testRandomIntegers() {
    console.log('\n=== Testing Random Integer Generation ===');
    
    const samples = [];
    const min = 1;
    const max = 7; // Dice range
    
    console.log(`Generating ${TEST_CONFIG.DICE_ROLLS} dice rolls...`);
    for (let i = 0; i < TEST_CONFIG.DICE_ROLLS; i++) {
        samples.push(secureRandomInt(min, max));
    }
    
    const expectedFreq = TEST_CONFIG.DICE_ROLLS / 6;
    const result = chiSquareTest(samples, expectedFreq);
    
    console.log('Frequency Distribution:');
    for (let i = 1; i <= 6; i++) {
        const freq = result.frequencies[i] || 0;
        const percentage = ((freq / TEST_CONFIG.DICE_ROLLS) * 100).toFixed(1);
        console.log(`  ${i}: ${freq} times (${percentage}%) Expected: ~${expectedFreq.toFixed(0)}`);
    }
    
    console.log(`Chi-Square: ${result.chiSquare.toFixed(4)}`);
    console.log(`Degrees of Freedom: ${result.degreesOfFreedom}`);
    
    // Critical value for 5 degrees of freedom at p=0.05 is ~11.07
    const isUniform = result.chiSquare < 11.07;
    console.log(`Result: ${isUniform ? '✅ PASS' : '❌ FAIL'} - Distribution is ${isUniform ? 'uniform' : 'non-uniform'}`);
    
    return isUniform;
}

/**
 * Test random float generation
 */
function testRandomFloats() {
    console.log('\n=== Testing Random Float Generation ===');
    
    const samples = [];
    const bins = 10;
    
    console.log(`Generating ${TEST_CONFIG.SAMPLE_SIZE} random floats...`);
    for (let i = 0; i < TEST_CONFIG.SAMPLE_SIZE; i++) {
        const value = secureRandomFloat(0, 1);
        const bin = Math.floor(value * bins);
        samples.push(Math.min(bin, bins - 1));
    }
    
    const expectedFreq = TEST_CONFIG.SAMPLE_SIZE / bins;
    const result = chiSquareTest(samples, expectedFreq);
    
    console.log('Distribution across 10 bins (0.0-0.1, 0.1-0.2, etc.):');
    for (let i = 0; i < bins; i++) {
        const freq = result.frequencies[i] || 0;
        const percentage = ((freq / TEST_CONFIG.SAMPLE_SIZE) * 100).toFixed(1);
        const range = `${(i/bins).toFixed(1)}-${((i+1)/bins).toFixed(1)}`;
        console.log(`  ${range}: ${freq} (${percentage}%)`);
    }
    
    console.log(`Chi-Square: ${result.chiSquare.toFixed(4)}`);
    
    // Critical value for 9 degrees of freedom at p=0.05 is ~16.92
    const isUniform = result.chiSquare < 16.92;
    console.log(`Result: ${isUniform ? '✅ PASS' : '❌ FAIL'} - Distribution is ${isUniform ? 'uniform' : 'non-uniform'}`);
    
    return isUniform;
}

/**
 * Test provably fair random generation
 */
function testProvablyFair() {
    console.log('\n=== Testing Provably Fair Generation ===');
    
    const userId = 'test_user_123';
    const gameType = 'test_game';
    const results = [];
    
    console.log('Generating provably fair randoms...');
    for (let i = 0; i < 100; i++) {
        const result = generateProvablyFairRandom(gameType, userId, 1, 101);
        results.push(result);
    }
    
    // Check that proofs are unique
    const proofHashes = results.map(r => r.proof.hash);
    const uniqueHashes = new Set(proofHashes);
    
    console.log(`Generated ${results.length} results with ${uniqueHashes.size} unique proof hashes`);
    console.log(`Sample proof hash: ${proofHashes[0].substring(0, 16)}...`);
    console.log(`All proofs have algorithms: ${results.every(r => r.proof.algorithm)}`);
    console.log(`All proofs have timestamps: ${results.every(r => r.proof.timestamp)}`);
    console.log(`All proofs have entropy health: ${results.every(r => r.proof.entropy_health)}`);
    
    const allUnique = uniqueHashes.size === results.length;
    console.log(`Result: ${allUnique ? '✅ PASS' : '❌ FAIL'} - All proofs are ${allUnique ? 'unique' : 'not unique'}`);
    
    return allUnique;
}

/**
 * Test anti-streak functionality
 */
function testAntiStreak() {
    console.log('\n=== Testing Anti-Streak Protection ===');
    
    const possibleValues = [1, 2, 3, 4, 5, 6];
    const recentResults = [6, 6, 6]; // Three 6's in a row
    const testResults = [];
    
    console.log('Testing with recent streak: [6, 6, 6]');
    
    for (let i = 0; i < 100; i++) {
        const result = generateAntiStreakRandom(recentResults, possibleValues, 3);
        testResults.push(result);
    }
    
    const sixCount = testResults.filter(r => r === 6).length;
    const percentage = (sixCount / testResults.length * 100).toFixed(1);
    
    console.log(`Out of 100 rolls after streak of 6's:`);
    console.log(`  Rolled 6: ${sixCount} times (${percentage}%)`);
    console.log(`  Expected without anti-streak: ~16.7%`);
    
    // Anti-streak should significantly reduce 6's
    const isWorking = sixCount < 10; // Should be much less than 16.7%
    console.log(`Result: ${isWorking ? '✅ PASS' : '❌ FAIL'} - Anti-streak is ${isWorking ? 'working' : 'not working'}`);
    
    return isWorking;
}

/**
 * Test weighted choice functionality
 */
function testWeightedChoice() {
    console.log('\n=== Testing Weighted Choice ===');
    
    const items = ['A', 'B', 'C'];
    const weights = [70, 20, 10]; // A should appear ~70% of time
    const results = [];
    
    for (let i = 0; i < 1000; i++) {
        const choice = secureWeightedChoice(items, weights);
        results.push(choice);
    }
    
    const counts = {
        A: results.filter(r => r === 'A').length,
        B: results.filter(r => r === 'B').length,
        C: results.filter(r => r === 'C').length
    };
    
    console.log('Weighted choice results (weights: A=70, B=20, C=10):');
    console.log(`  A: ${counts.A} (${(counts.A/10).toFixed(1)}%) Expected: ~70%`);
    console.log(`  B: ${counts.B} (${(counts.B/10).toFixed(1)}%) Expected: ~20%`);
    console.log(`  C: ${counts.C} (${(counts.C/10).toFixed(1)}%) Expected: ~10%`);
    
    // Check if distribution is roughly correct (within reasonable bounds)
    const aInRange = counts.A >= 650 && counts.A <= 750;
    const bInRange = counts.B >= 150 && counts.B <= 250;
    const cInRange = counts.C >= 50 && counts.C <= 150;
    
    const isWorking = aInRange && bInRange && cInRange;
    console.log(`Result: ${isWorking ? '✅ PASS' : '❌ FAIL'} - Weighted distribution is ${isWorking ? 'correct' : 'incorrect'}`);
    
    return isWorking;
}

/**
 * Test CSPRNG system health
 */
function testSystemHealth() {
    console.log('\n=== Testing CSPRNG System Health ===');
    
    const stats = getCSPRNGStatistics();
    
    console.log('CSPRNG Statistics:');
    console.log(`  Operations: ${stats.operationCount}`);
    console.log(`  Current Algorithm: ${stats.currentAlgorithm}`);
    console.log(`  Last Reseed: ${stats.lastReseed}`);
    console.log(`  Pattern History Size: ${stats.patternHistorySize}`);
    console.log(`  Statistics Buffer Size: ${stats.statisticsBufferSize}`);
    console.log(`  Entropy Health: ${stats.entropyPoolHealth.status} (${(stats.entropyPoolHealth.healthScore * 100).toFixed(1)}%)`);
    
    const isHealthy = stats.entropyPoolHealth.status !== 'POOR' && stats.operationCount > 0;
    console.log(`Result: ${isHealthy ? '✅ PASS' : '❌ FAIL'} - System health is ${isHealthy ? 'good' : 'poor'}`);
    
    return isHealthy;
}

/**
 * Run all tests
 */
async function runAllTests() {
    console.log('🎰 ATIVE Casino Bot - CSPRNG Test Suite');
    console.log('==========================================');
    
    const startTime = Date.now();
    const testResults = [];
    
    try {
        testResults.push(await testRandomIntegers());
        testResults.push(await testRandomFloats());
        testResults.push(await testProvablyFair());
        testResults.push(await testAntiStreak());
        testResults.push(await testWeightedChoice());
        testResults.push(await testSystemHealth());
        
        const passCount = testResults.filter(result => result).length;
        const totalTests = testResults.length;
        const duration = Date.now() - startTime;
        
        console.log('\n==========================================');
        console.log(`Test Results: ${passCount}/${totalTests} passed`);
        console.log(`Duration: ${duration}ms`);
        
        if (passCount === totalTests) {
            console.log('🎉 ALL TESTS PASSED - CSPRNG is working correctly!');
        } else {
            console.log('⚠️  SOME TESTS FAILED - Check implementation');
        }
        
    } catch (error) {
        console.error('❌ Test suite failed with error:', error.message);
    }
}

// Run tests if this script is executed directly
if (require.main === module) {
    runAllTests();
}

module.exports = {
    runAllTests,
    testRandomIntegers,
    testRandomFloats,
    testProvablyFair,
    testAntiStreak,
    testWeightedChoice,
    testSystemHealth
};