/**
 * Live Roulette Test - Test actual game flow
 * This simulates the exact same flow as a real game
 */

const { RouletteGame } = require('./GAMES/roulette');

async function testLiveRouletteFlow() {
    console.log('🎰 LIVE ROULETTE FLOW TEST\n');
    console.log('='.repeat(60));
    
    const testSpins = 1000;
    const results = {
        red: 0,
        black: 0,
        green: 0,
        total: 0
    };
    
    const betTypes = ['red', 'black', 'green', 'odd', 'even', 'dozen1'];
    
    console.log(`🔄 Testing ${testSpins} live game simulations...\n`);
    
    for (let i = 0; i < testSpins; i++) {
        // Create new game instance (same as live games)
        const game = new RouletteGame(`testUser${i}`, 1000);
        
        // Place a random bet (same as users do)
        const betType = betTypes[Math.floor(Math.random() * betTypes.length)];
        game.placeBet(betType, 1000);
        
        // Simulate the spin process exactly like the command does:
        // 1. Set spinning state
        game.isSpinning = true;
        
        // 2. Reset spinning state before calling spin() (like in spinRoulette)
        game.isSpinning = false;
        
        // 3. Call game.spin() - this is where the CSPRNG should work
        const result = game.spin();
        
        // 4. Calculate payout (same as endGame)
        const payout = game.calculatePayout(result);
        
        // Count results
        const color = game.getNumberColor(result);
        results[color]++;
        results.total++;
        
        if (i % 100 === 0) {
            process.stdout.write(`Progress: ${(i / testSpins * 100).toFixed(1)}%\r`);
        }
    }
    
    console.log('\n📊 LIVE GAME RESULTS:\n');
    
    const redPercent = (results.red / results.total * 100);
    const blackPercent = (results.black / results.total * 100);
    const greenPercent = (results.green / results.total * 100);
    
    console.log('COLOR DISTRIBUTION:');
    console.log(`🔴 Red:   ${results.red} (${redPercent.toFixed(2)}%) - Expected: ~47.37%`);
    console.log(`⚫ Black: ${results.black} (${blackPercent.toFixed(2)}%) - Expected: ~47.37%`);
    console.log(`🟢 Green: ${results.green} (${greenPercent.toFixed(2)}%) - Expected: ~5.26%`);
    
    // Analysis
    const greenExpected = 5.26;
    const greenDeviation = Math.abs(greenPercent - greenExpected);
    
    console.log(`\n🎯 GREEN FREQUENCY ANALYSIS:`);
    console.log(`Expected: ${greenExpected}%`);
    console.log(`Actual: ${greenPercent.toFixed(2)}%`);
    console.log(`Deviation: ${greenDeviation.toFixed(2)}%`);
    
    // Check if green is appearing too frequently
    if (greenPercent > 10) {
        console.log(`❌ GREEN IS APPEARING TOO FREQUENTLY! (${greenPercent.toFixed(2)}% > 10%)`);
        console.log(`   This suggests there's still bias in the system.`);
        return false;
    } else if (greenDeviation > 2.0) {
        console.log(`⚠️  Green frequency is outside normal range (deviation: ${greenDeviation.toFixed(2)}%)`);
        return false;
    } else {
        console.log(`✅ Green frequency is within acceptable range`);
        return true;
    }
}

async function debugSpinMethod() {
    console.log('\n🔬 DEBUGGING SPIN METHOD:\n');
    console.log('='.repeat(40));
    
    const game = new RouletteGame('debugUser', 1000);
    game.placeBet('red', 1000);
    
    // Test the CSPRNG directly
    console.log('Testing CSPRNG directly:');
    for (let i = 0; i < 10; i++) {
        const randomIndex = game.secureRandomInt(0, 38);
        const result = game.wheelNumbers[randomIndex];
        const color = game.getNumberColor(result);
        console.log(`  Spin ${i + 1}: Index ${randomIndex} → ${result} (${color})`);
    }
    
    console.log('\nTesting game.spin() method:');
    for (let i = 0; i < 10; i++) {
        const newGame = new RouletteGame(`debugUser${i}`, 1000);
        newGame.placeBet('red', 1000);
        const result = newGame.spin();
        const color = newGame.getNumberColor(result);
        console.log(`  Game ${i + 1}: ${result} (${color})`);
    }
}

// Run tests
async function runAllTests() {
    await debugSpinMethod();
    const isHealthy = await testLiveRouletteFlow();
    
    console.log('\n' + '='.repeat(60));
    if (isHealthy) {
        console.log('✅ Roulette randomness is healthy - green appears at normal frequency');
    } else {
        console.log('❌ Roulette has bias issues - green appears too frequently');
        console.log('   Check for any overrides or additional RNG manipulation');
    }
}

runAllTests().catch(console.error);