#!/usr/bin/env node

/**
 * Comprehensive Game Testing Script
 * Tests all games and CSPRNG functionality
 */

const fs = require('fs');
const path = require('path');

// Import CSPRNG functions for testing
const { 
    secureRandomInt, 
    secureRandomFloat, 
    generateProvablyFairRandom,
    getCSPRNGStatistics,
    generateAntiStreakRandom
} = require('./UTILS/rng');

// Test configuration
const TEST_CONFIG = {
    SAMPLE_SIZE: 100,
    DICE_TESTS: 50,
    SLOTS_SPINS: 20
};

/**
 * Test CEELO game logic
 */
function testCeeloGame() {
    console.log('\n🎲 Testing CEELO Game...');
    
    try {
        const results = [];
        
        for (let i = 0; i < TEST_CONFIG.DICE_TESTS; i++) {
            // Simulate CEELO dice rolls using CSPRNG
            const playerFairRoll = generateProvablyFairRandom('ceelo_player', `test_user_${i}`, 0, 216);
            const playerRollValue = playerFairRoll.value;
            
            const playerDice = [
                Math.floor(playerRollValue / 36) + 1,
                Math.floor((playerRollValue % 36) / 6) + 1,
                (playerRollValue % 6) + 1
            ].sort((a, b) => a - b);
            
            const houseDice = [
                secureRandomInt(1, 7),
                secureRandomInt(1, 7),
                secureRandomInt(1, 7)
            ].sort((a, b) => a - b);
            
            results.push({ player: playerDice, house: houseDice });
        }
        
        // Analyze results
        const diceFreq = {};
        results.forEach(r => {
            r.player.concat(r.house).forEach(die => {
                diceFreq[die] = (diceFreq[die] || 0) + 1;
            });
        });
        
        console.log('Dice frequency distribution:');
        for (let i = 1; i <= 6; i++) {
            const freq = diceFreq[i] || 0;
            const percentage = ((freq / (TEST_CONFIG.DICE_TESTS * 6)) * 100).toFixed(1);
            console.log(`  ${i}: ${freq} times (${percentage}%)`);
        }
        
        const isUniform = Object.values(diceFreq).every(f => f >= 15 && f <= 35); // Reasonable range
        console.log(`✅ CEELO: ${isUniform ? 'PASS' : 'FAIL'} - Distribution is ${isUniform ? 'reasonable' : 'skewed'}`);
        
        return isUniform;
        
    } catch (error) {
        console.log(`❌ CEELO: FAIL - ${error.message}`);
        return false;
    }
}

/**
 * Test Slots game randomization
 */
function testSlotsGame() {
    console.log('\n🎰 Testing Slots Game...');
    
    try {
        const symbolKeys = ['cherries', 'lemon', 'orange', 'grapes', 'watermelon', 'bar'];
        const results = [];
        
        for (let i = 0; i < TEST_CONFIG.SLOTS_SPINS; i++) {
            const spin = [
                symbolKeys[secureRandomInt(0, symbolKeys.length)],
                symbolKeys[secureRandomInt(0, symbolKeys.length)],
                symbolKeys[secureRandomInt(0, symbolKeys.length)]
            ];
            results.push(spin);
        }
        
        // Count symbol occurrences
        const symbolCount = {};
        results.flat().forEach(symbol => {
            symbolCount[symbol] = (symbolCount[symbol] || 0) + 1;
        });
        
        console.log('Symbol distribution:');
        Object.entries(symbolCount).forEach(([symbol, count]) => {
            const percentage = ((count / (TEST_CONFIG.SLOTS_SPINS * 3)) * 100).toFixed(1);
            console.log(`  ${symbol}: ${count} times (${percentage}%)`);
        });
        
        const hasAllSymbols = symbolKeys.every(s => symbolCount[s] > 0);
        console.log(`✅ Slots: ${hasAllSymbols ? 'PASS' : 'FAIL'} - ${hasAllSymbols ? 'All symbols appeared' : 'Some symbols missing'}`);
        
        return hasAllSymbols;
        
    } catch (error) {
        console.log(`❌ Slots: FAIL - ${error.message}`);
        return false;
    }
}

/**
 * Test Keno number generation
 */
function testKenoGame() {
    console.log('\n🔢 Testing Keno Game...');
    
    try {
        const draws = [];
        
        for (let i = 0; i < 10; i++) {
            // Simulate Keno draw (20 numbers from 1-80)
            const available = Array.from({length: 80}, (_, i) => i + 1);
            const drawnNumbers = [];
            
            for (let j = 0; j < 20; j++) {
                const randomIndex = secureRandomInt(0, available.length);
                drawnNumbers.push(available.splice(randomIndex, 1)[0]);
            }
            
            draws.push(drawnNumbers.sort((a, b) => a - b));
        }
        
        // Check for number distribution
        const numberFreq = {};
        draws.flat().forEach(num => {
            numberFreq[num] = (numberFreq[num] || 0) + 1;
        });
        
        const uniqueNumbers = Object.keys(numberFreq).length;
        const avgFrequency = Object.values(numberFreq).reduce((a, b) => a + b, 0) / uniqueNumbers;
        
        console.log(`Numbers drawn: ${uniqueNumbers}/80 unique numbers`);
        console.log(`Average frequency: ${avgFrequency.toFixed(2)}`);
        
        const isGoodDistribution = uniqueNumbers >= 150; // Should cover most numbers in 10 draws
        console.log(`✅ Keno: ${isGoodDistribution ? 'PASS' : 'FAIL'} - Distribution is ${isGoodDistribution ? 'good' : 'poor'}`);
        
        return isGoodDistribution;
        
    } catch (error) {
        console.log(`❌ Keno: FAIL - ${error.message}`);
        return false;
    }
}

/**
 * Test Russian Roulette
 */
function testRussianRouletteGame() {
    console.log('\n🔫 Testing Russian Roulette...');
    
    try {
        const results = [];
        
        for (let i = 0; i < TEST_CONFIG.SAMPLE_SIZE; i++) {
            // Simulate chamber selection (1-6)
            const chamber = secureRandomInt(1, 7);
            const bulletChamber = secureRandomInt(1, 7);
            
            results.push({
                chamber,
                bulletChamber,
                hit: chamber === bulletChamber
            });
        }
        
        const hits = results.filter(r => r.hit).length;
        const hitRate = (hits / results.length * 100).toFixed(1);
        
        console.log(`Hits: ${hits}/${results.length} (${hitRate}%)`);
        console.log(`Expected: ~16.7%`);
        
        const isRealistic = hits >= 10 && hits <= 25; // Should be around 16.7%
        console.log(`✅ Russian Roulette: ${isRealistic ? 'PASS' : 'FAIL'} - Hit rate is ${isRealistic ? 'realistic' : 'unrealistic'}`);
        
        return isRealistic;
        
    } catch (error) {
        console.log(`❌ Russian Roulette: FAIL - ${error.message}`);
        return false;
    }
}

/**
 * Test Anti-Streak functionality across games
 */
function testAntiStreakProtection() {
    console.log('\n🛡️ Testing Anti-Streak Protection...');
    
    try {
        const recentWins = [true, true, true]; // Three consecutive wins
        const possibleResults = [true, false]; // Win or lose
        const results = [];
        
        for (let i = 0; i < 50; i++) {
            const result = generateAntiStreakRandom(recentWins, possibleResults, 3);
            results.push(result);
        }
        
        const winCount = results.filter(r => r === true).length;
        const winRate = (winCount / results.length * 100).toFixed(1);
        
        console.log(`After streak of 3 wins:`);
        console.log(`Subsequent wins: ${winCount}/50 (${winRate}%)`);
        console.log(`Expected without anti-streak: ~50%`);
        
        const isWorking = winCount < 30; // Should be significantly less than 50%
        console.log(`✅ Anti-Streak: ${isWorking ? 'PASS' : 'FAIL'} - Protection is ${isWorking ? 'working' : 'not working'}`);
        
        return isWorking;
        
    } catch (error) {
        console.log(`❌ Anti-Streak: FAIL - ${error.message}`);
        return false;
    }
}

/**
 * Test CSPRNG system health
 */
function testSystemHealth() {
    console.log('\n💊 Testing System Health...');
    
    try {
        const stats = getCSPRNGStatistics();
        
        console.log(`Operations: ${stats.operationCount}`);
        console.log(`Algorithm: ${stats.currentAlgorithm}`);
        console.log(`Entropy Health: ${stats.entropyPoolHealth.status} (${(stats.entropyPoolHealth.healthScore * 100).toFixed(1)}%)`);
        
        const isHealthy = stats.entropyPoolHealth.status !== 'POOR';
        console.log(`✅ System Health: ${isHealthy ? 'PASS' : 'FAIL'} - Health is ${stats.entropyPoolHealth.status}`);
        
        return isHealthy;
        
    } catch (error) {
        console.log(`❌ System Health: FAIL - ${error.message}`);
        return false;
    }
}

/**
 * Verify files have CSPRNG imports
 */
function verifyCSPRNGImplementation() {
    console.log('\n📁 Verifying CSPRNG Implementation...');
    
    const gameFiles = [
        'GAMES/ceelo.js',
        'GAMES/keno.js',
        'GAMES/russianRoulette.js',
        'GAMES/slots.js',
        'GAMES/rps.js',
        'GAMES/scratchTickets.js'
    ];
    
    let implementedCount = 0;
    
    gameFiles.forEach(file => {
        try {
            const content = fs.readFileSync(path.join(__dirname, file), 'utf8');
            const hasCSPRNGImport = content.includes("require('../UTILS/rng')") || content.includes("require('./rng')");
            const noMathRandom = !content.includes('Math.random()');
            
            if (hasCSPRNGImport && noMathRandom) {
                console.log(`  ✅ ${file}: CSPRNG implemented, no Math.random()`);
                implementedCount++;
            } else {
                console.log(`  ❌ ${file}: Missing CSPRNG or has Math.random()`);
            }
        } catch (error) {
            console.log(`  ⚠️  ${file}: File not found or error reading`);
        }
    });
    
    const allImplemented = implementedCount === gameFiles.length;
    console.log(`✅ Implementation: ${allImplemented ? 'PASS' : 'FAIL'} - ${implementedCount}/${gameFiles.length} games use CSPRNG`);
    
    return allImplemented;
}

/**
 * Main test execution
 */
async function runAllTests() {
    console.log('🎰 ATIVE Casino Bot - Comprehensive Game Testing');
    console.log('==============================================');
    
    const startTime = Date.now();
    const testResults = [];
    
    try {
        // Core functionality tests
        testResults.push(testCeeloGame());
        testResults.push(testSlotsGame());
        testResults.push(testKenoGame());
        testResults.push(testRussianRouletteGame());
        
        // Advanced features
        testResults.push(testAntiStreakProtection());
        testResults.push(testSystemHealth());
        
        // Implementation verification
        testResults.push(verifyCSPRNGImplementation());
        
        const passCount = testResults.filter(result => result).length;
        const totalTests = testResults.length;
        const duration = Date.now() - startTime;
        
        console.log('\n==============================================');
        console.log(`🎯 Test Results: ${passCount}/${totalTests} passed`);
        console.log(`⏱️  Duration: ${duration}ms`);
        
        if (passCount === totalTests) {
            console.log('🎉 ALL TESTS PASSED - Games are using CSPRNG correctly!');
        } else {
            console.log('⚠️  SOME TESTS FAILED - Check implementation');
        }
        
        // Show final CSPRNG stats
        const finalStats = getCSPRNGStatistics();
        console.log(`\n📊 Final CSPRNG Stats:`);
        console.log(`   Operations performed: ${finalStats.operationCount}`);
        console.log(`   Current algorithm: ${finalStats.currentAlgorithm}`);
        console.log(`   Entropy health: ${finalStats.entropyPoolHealth.status}`);
        
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
    testCeeloGame,
    testSlotsGame,
    testKenoGame,
    testRussianRouletteGame,
    testAntiStreakProtection,
    testSystemHealth,
    verifyCSPRNGImplementation
};