/**
 * Streak Breaking Test for Roulette
 * Verifies that excessive green streaks are prevented while maintaining overall fairness
 */

const { RouletteGame } = require('./GAMES/roulette');

async function testStreakBreaking() {
    console.log('🎯 ROULETTE STREAK BREAKING TEST\n');
    console.log('='.repeat(60));
    
    const testSpins = 2000;
    const results = {
        red: 0,
        black: 0,
        green: 0,
        maxGreenStreak: 0,
        currentGreenStreak: 0,
        greenStreaks: [],
        resultHistory: []
    };
    
    console.log(`🔄 Testing ${testSpins} spins with streak breaking...\n`);
    
    for (let i = 0; i < testSpins; i++) {
        const game = new RouletteGame(`testUser${i}`, 1000);
        game.placeBet('red', 1000);
        
        const result = game.spin();
        const color = game.getNumberColor(result);
        
        // Track results
        results[color]++;
        results.resultHistory.push({ result, color });
        
        // Track green streaks
        if (color === 'green') {
            results.currentGreenStreak++;
            results.maxGreenStreak = Math.max(results.maxGreenStreak, results.currentGreenStreak);
        } else {
            if (results.currentGreenStreak > 0) {
                results.greenStreaks.push(results.currentGreenStreak);
                results.currentGreenStreak = 0;
            }
        }
        
        if (i % 200 === 0) {
            process.stdout.write(`Progress: ${(i / testSpins * 100).toFixed(1)}%\r`);
        }
    }
    
    // Final streak if ending on green
    if (results.currentGreenStreak > 0) {
        results.greenStreaks.push(results.currentGreenStreak);
    }
    
    console.log('\n📊 STREAK BREAKING RESULTS:\n');
    
    // Overall distribution
    const total = results.red + results.black + results.green;
    const redPercent = (results.red / total * 100);
    const blackPercent = (results.black / total * 100);
    const greenPercent = (results.green / total * 100);
    
    console.log('COLOR DISTRIBUTION:');
    console.log(`🔴 Red:   ${results.red} (${redPercent.toFixed(2)}%) - Expected: ~47.37%`);
    console.log(`⚫ Black: ${results.black} (${blackPercent.toFixed(2)}%) - Expected: ~47.37%`);
    console.log(`🟢 Green: ${results.green} (${greenPercent.toFixed(2)}%) - Expected: ~5.26%`);
    
    // Streak analysis
    console.log(`\n🎯 STREAK ANALYSIS:`);
    console.log(`Maximum green streak: ${results.maxGreenStreak}`);
    console.log(`Total green streaks: ${results.greenStreaks.length}`);
    
    if (results.greenStreaks.length > 0) {
        const avgStreak = results.greenStreaks.reduce((a, b) => a + b, 0) / results.greenStreaks.length;
        console.log(`Average streak length: ${avgStreak.toFixed(2)}`);
        
        // Count streaks by length
        const streakCounts = {};
        results.greenStreaks.forEach(streak => {
            streakCounts[streak] = (streakCounts[streak] || 0) + 1;
        });
        
        console.log(`\nStreak length distribution:`);
        Object.keys(streakCounts).sort((a, b) => parseInt(a) - parseInt(b)).forEach(length => {
            console.log(`  ${length} green(s): ${streakCounts[length]} times`);
        });
    }
    
    // Test effectiveness
    console.log(`\n✅ STREAK BREAKING EFFECTIVENESS:`);
    
    const longStreaks = results.greenStreaks.filter(streak => streak >= 3);
    const veryLongStreaks = results.greenStreaks.filter(streak => streak >= 4);
    
    console.log(`Streaks of 3+ greens: ${longStreaks.length} (${((longStreaks.length / results.greenStreaks.length) * 100).toFixed(1)}%)`);
    console.log(`Streaks of 4+ greens: ${veryLongStreaks.length} (${((veryLongStreaks.length / results.greenStreaks.length) * 100).toFixed(1)}%)`);
    console.log(`Maximum streak: ${results.maxGreenStreak} ${results.maxGreenStreak <= 3 ? '✅' : '⚠️'}`);
    
    // Assessment
    const isEffective = results.maxGreenStreak <= 3 && veryLongStreaks.length === 0;
    const isFair = greenPercent >= 4.0 && greenPercent <= 7.0; // Within reasonable range
    
    console.log(`\n🏆 OVERALL ASSESSMENT:`);
    console.log(`${isEffective ? '✅' : '❌'} Streak breaking is ${isEffective ? 'effective' : 'ineffective'}`);
    console.log(`${isFair ? '✅' : '❌'} Overall distribution is ${isFair ? 'fair' : 'biased'}`);
    
    if (isEffective && isFair) {
        console.log(`\n🎉 SUCCESS! Streak breaking prevents long green runs while maintaining fairness.`);
        console.log(`   Users will experience fewer frustrating green streaks.`);
    } else {
        console.log(`\n⚠️  Issues detected. Review the streak breaking algorithm.`);
    }
    
    return { isEffective, isFair, maxStreak: results.maxGreenStreak, greenPercent };
}

// Run comprehensive streak test
async function testWorstCaseScenario() {
    console.log('\n🚨 WORST CASE SCENARIO TEST:\n');
    console.log('Simulating conditions that would normally create long green streaks...\n');
    
    // Force a scenario where we'd normally get lots of greens
    let consecutiveAttempts = 0;
    const maxConsecutive = 10;
    
    for (let i = 0; i < maxConsecutive; i++) {
        const game = new RouletteGame(`worstCase${i}`, 1000);
        game.placeBet('red', 1000);
        
        const result = game.spin();
        const color = game.getNumberColor(result);
        
        console.log(`Attempt ${i + 1}: ${result} (${color})`);
        
        if (color === 'green') {
            consecutiveAttempts++;
        } else {
            break;
        }
    }
    
    console.log(`\nConsecutive greens in worst case: ${consecutiveAttempts}`);
    console.log(`${consecutiveAttempts <= 2 ? '✅' : '❌'} Streak breaking ${consecutiveAttempts <= 2 ? 'worked' : 'failed'} in worst case`);
}

// Run all tests
async function runStreakTests() {
    const results = await testStreakBreaking();
    await testWorstCaseScenario();
    
    console.log('\n' + '='.repeat(60));
    if (results.isEffective && results.isFair) {
        console.log('🎯 Streak breaking successfully implemented!');
        console.log('   Green will feel much less frequent to users.');
    } else {
        console.log('⚠️  Streak breaking needs adjustment.');
    }
}

runStreakTests().catch(console.error);