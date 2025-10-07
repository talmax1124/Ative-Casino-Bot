/**
 * Test User Experience - Simulate exactly what the user experienced
 * Test 15 consecutive games like the user played
 */

const { RouletteGame } = require('./GAMES/roulette');

async function simulateUserExperience() {
    console.log('🎮 SIMULATING USER EXPERIENCE\n');
    console.log('='.repeat(50));
    console.log('Testing 15 consecutive games like user reported...\n');
    
    const results = [];
    const colorCounts = { red: 0, black: 0, green: 0 };
    
    for (let i = 0; i < 15; i++) {
        console.log(`Game ${i + 1}:`);
        
        // Create fresh game instance (like user does)
        const game = new RouletteGame(`user_game_${i}`, 1000);
        
        // Place a bet (user typically bets on red/black)
        game.placeBet('red', 1000);
        
        // Show game state before spin
        console.log(`  Bet: red ($1000)`);
        
        // Spin the wheel
        const result = game.spin();
        const color = game.getNumberColor(result);
        const payout = game.calculatePayout(result);
        const won = payout > 0;
        
        // Track results
        results.push({ game: i + 1, result, color, won, payout });
        colorCounts[color]++;
        
        console.log(`  Result: ${result} (${color.toUpperCase()}) - ${won ? 'WON' : 'LOST'} ${won ? `$${payout}` : '$0'}`);
        
        // Show mobile display
        const mobileDisplay = game.generateMobileWheelDisplay();
        console.log('  Mobile Display:');
        console.log(mobileDisplay.split('\n').map(line => '    ' + line).join('\n'));
        
        console.log(''); // Empty line between games
    }
    
    console.log('📊 SUMMARY OF 15 GAMES:\n');
    console.log(`Red:   ${colorCounts.red} games (${(colorCounts.red/15*100).toFixed(1)}%)`);
    console.log(`Black: ${colorCounts.black} games (${(colorCounts.black/15*100).toFixed(1)}%)`);
    console.log(`Green: ${colorCounts.green} games (${(colorCounts.green/15*100).toFixed(1)}%)`);
    
    // Analysis
    console.log('\n🔍 ANALYSIS:');
    
    if (colorCounts.red === 0) {
        console.log('❌ CRITICAL: No reds appeared - this matches user report!');
        console.log('   Probability of this: ~0.000003% (extremely unlikely)');
        console.log('   This indicates a systematic bias against red.');
    } else if (colorCounts.red < 3) {
        console.log('⚠️  Very few reds appeared - unusual but possible');
        console.log(`   Probability: ~${(Math.pow(0.526, 15-colorCounts.red) * 100).toFixed(4)}%`);
    } else {
        console.log('✅ Red frequency appears normal for this sample');
    }
    
    if (colorCounts.black > 10) {
        console.log('⚠️  Black appeared very frequently');
    }
    
    if (colorCounts.green > 3) {
        console.log('⚠️  Green appeared more than expected');
    }
    
    // Test sequence for patterns
    console.log('\n🔄 RESULT SEQUENCE:');
    const sequence = results.map(r => `${r.result}(${r.color[0].toUpperCase()})`).join(' → ');
    console.log(sequence);
    
    return { colorCounts, results };
}

async function testMultipleRuns() {
    console.log('\n🔁 TESTING MULTIPLE RUNS:\n');
    console.log('Running 10 sets of 15 games to check consistency...\n');
    
    const allRuns = [];
    
    for (let run = 0; run < 10; run++) {
        const runResults = { red: 0, black: 0, green: 0 };
        
        for (let game = 0; game < 15; game++) {
            const testGame = new RouletteGame(`run${run}_game${game}`, 1000);
            testGame.placeBet('red', 1000);
            const result = testGame.spin();
            const color = testGame.getNumberColor(result);
            runResults[color]++;
        }
        
        allRuns.push(runResults);
        console.log(`Run ${run + 1}: Red=${runResults.red}, Black=${runResults.black}, Green=${runResults.green}`);
    }
    
    // Check for systematic bias
    const redCounts = allRuns.map(r => r.red);
    const minRed = Math.min(...redCounts);
    const maxRed = Math.max(...redCounts);
    const avgRed = redCounts.reduce((a, b) => a + b, 0) / 10;
    
    console.log(`\nRed frequency across runs:`);
    console.log(`  Min: ${minRed}, Max: ${maxRed}, Average: ${avgRed.toFixed(1)}`);
    console.log(`  Expected average: ~7.1 (47.37% of 15)`);
    
    if (avgRed < 5) {
        console.log('❌ SYSTEMATIC RED BIAS DETECTED');
    } else {
        console.log('✅ No systematic bias detected');
    }
}

// Run simulation
async function runUserTest() {
    const userSim = await simulateUserExperience();
    await testMultipleRuns();
    
    console.log('\n' + '='.repeat(50));
    if (userSim.colorCounts.red === 0) {
        console.log('🚨 CONFIRMED: Red bias issue exists!');
        console.log('   Investigation needed in live system.');
    } else {
        console.log('✅ Could not reproduce red bias in simulation.');
        console.log('   Issue may be intermittent or environment-specific.');
    }
}

runUserTest().catch(console.error);