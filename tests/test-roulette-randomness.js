/**
 * Roulette Randomness Test Suite
 * Tests CSPRNG distribution and verifies green probability is correct
 */

const { RouletteGame } = require('./GAMES/roulette');

async function testRandomnessDistribution() {
    console.log('🎰 ROULETTE RANDOMNESS TEST SUITE\n');
    console.log('='.repeat(60));
    
    const testSpins = 10000; // Large sample size
    const results = {
        red: 0,
        black: 0,
        green: 0,
        numbers: {}
    };
    
    // Initialize number counts
    for (let i = 0; i <= 36; i++) {
        results.numbers[i] = 0;
    }
    results.numbers['00'] = 0;
    
    console.log(`🔄 Running ${testSpins} spins to test randomness...\n`);
    
    // Run the test spins
    for (let i = 0; i < testSpins; i++) {
        const game = new RouletteGame('testUser', 1000);
        game.placeBet('red', 1000); // Need a bet to spin
        
        const result = game.spin();
        const color = game.getNumberColor(result);
        
        // Count by color
        results[color]++;
        
        // Count by number
        results.numbers[result]++;
        
        if (i % 1000 === 0) {
            process.stdout.write(`Progress: ${(i / testSpins * 100).toFixed(1)}%\r`);
        }
    }
    
    console.log('\n📊 RESULTS ANALYSIS:\n');
    
    // Color distribution analysis
    const redPercent = (results.red / testSpins * 100);
    const blackPercent = (results.black / testSpins * 100);
    const greenPercent = (results.green / testSpins * 100);
    
    console.log('COLOR DISTRIBUTION:');
    console.log(`🔴 Red:   ${results.red} spins (${redPercent.toFixed(2)}%) - Expected: 47.37%`);
    console.log(`⚫ Black: ${results.black} spins (${blackPercent.toFixed(2)}%) - Expected: 47.37%`);
    console.log(`🟢 Green: ${results.green} spins (${greenPercent.toFixed(2)}%) - Expected: 5.26%`);
    
    // Check if green percentage is reasonable (should be around 5.26%)
    const greenExpected = 5.26;
    const greenDeviation = Math.abs(greenPercent - greenExpected);
    const greenAcceptable = greenDeviation < 1.0; // Within 1% is acceptable for large samples
    
    console.log(`\n🎯 GREEN ANALYSIS:`);
    console.log(`Expected: ${greenExpected}%`);
    console.log(`Actual: ${greenPercent.toFixed(2)}%`);
    console.log(`Deviation: ${greenDeviation.toFixed(2)}%`);
    console.log(`${greenAcceptable ? '✅' : '❌'} Green frequency is ${greenAcceptable ? 'ACCEPTABLE' : 'PROBLEMATIC'}`);
    
    // Individual number distribution
    console.log(`\n🔢 NUMBER DISTRIBUTION:`);
    const expectedPerNumber = testSpins / 38; // 38 numbers total
    let maxDeviation = 0;
    let worstNumber = null;
    
    for (const [number, count] of Object.entries(results.numbers)) {
        const percent = (count / testSpins * 100);
        const expectedPercent = 100 / 38; // 2.63%
        const deviation = Math.abs(percent - expectedPercent);
        
        if (deviation > maxDeviation) {
            maxDeviation = deviation;
            worstNumber = number;
        }
        
        if (count === 0 || deviation > 1.0) {
            console.log(`${number}: ${count} (${percent.toFixed(2)}%) - Deviation: ${deviation.toFixed(2)}%`);
        }
    }
    
    console.log(`\nMaximum deviation: ${maxDeviation.toFixed(2)}% (Number ${worstNumber})`);
    
    // Overall randomness assessment
    console.log(`\n${'='.repeat(60)}`);
    console.log(`\n📈 RANDOMNESS ASSESSMENT:\n`);
    
    const assessments = [
        {
            name: 'Green frequency',
            passed: greenAcceptable,
            details: `${greenPercent.toFixed(2)}% (expected ~5.26%)`
        },
        {
            name: 'Red/Black balance',
            passed: Math.abs(redPercent - blackPercent) < 2.0,
            details: `Red: ${redPercent.toFixed(1)}%, Black: ${blackPercent.toFixed(1)}%`
        },
        {
            name: 'Number distribution',
            passed: maxDeviation < 1.5,
            details: `Max deviation: ${maxDeviation.toFixed(2)}%`
        },
        {
            name: 'No zero frequencies',
            passed: Object.values(results.numbers).every(count => count > 0),
            details: `All numbers appeared at least once`
        }
    ];
    
    let totalPassed = 0;
    assessments.forEach(assessment => {
        console.log(`${assessment.passed ? '✅' : '❌'} ${assessment.name}: ${assessment.details}`);
        if (assessment.passed) totalPassed++;
    });
    
    console.log(`\n🏆 OVERALL SCORE: ${totalPassed}/${assessments.length} tests passed`);
    
    if (totalPassed === assessments.length) {
        console.log(`\n🎉 EXCELLENT! Roulette randomness is working correctly.`);
        console.log(`   Green appears at the natural probability (~5.26%)`);
        console.log(`   No artificial bias detected`);
        console.log(`   CSPRNG is functioning properly`);
    } else {
        console.log(`\n⚠️  Some randomness issues detected. Review the implementation.`);
    }
    
    // Payout verification
    console.log(`\n${'='.repeat(60)}`);
    console.log(`\n💰 PAYOUT VERIFICATION:\n`);
    
    const game = new RouletteGame('testUser', 1000);
    const payoutTests = [
        { bet: 'red', expected: '2.0x' },
        { bet: 'black', expected: '2.0x' },
        { bet: 'green', expected: '36.0x' },
        { bet: 'dozen1', expected: '3.0x' },
        { bet: 'number', expected: '36.0x' }
    ];
    
    payoutTests.forEach(test => {
        const odds = game.getPayoutOdds(test.bet);
        const correct = odds === test.expected;
        console.log(`${correct ? '✅' : '❌'} ${test.bet}: ${odds} (expected ${test.expected})`);
    });
}

// Run the test
testRandomnessDistribution().catch(console.error);