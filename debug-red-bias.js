/**
 * Debug Red Bias Issue
 * Investigate why red numbers aren't appearing
 */

const { RouletteGame } = require('./GAMES/roulette');

async function debugRedBias() {
    console.log('🔍 DEBUGGING RED BIAS ISSUE\n');
    console.log('='.repeat(50));
    
    // Test 1: Check red number definitions
    const game = new RouletteGame('testUser', 1000);
    console.log('1. RED NUMBERS DEFINED:');
    console.log('   Red numbers:', game.redNumbers);
    console.log('   Count:', game.redNumbers.length);
    
    console.log('\n2. WHEEL NUMBERS:');
    console.log('   Wheel:', game.wheelNumbers);
    console.log('   Total count:', game.wheelNumbers.length);
    
    // Test 2: Check color detection
    console.log('\n3. COLOR DETECTION TEST:');
    const testNumbers = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 0, '00'];
    testNumbers.forEach(num => {
        const color = game.getNumberColor(num);
        const isRed = game.redNumbers.includes(num);
        console.log(`   ${num}: ${color} (redNumbers.includes: ${isRed})`);
    });
    
    // Test 3: Direct CSPRNG test
    console.log('\n4. DIRECT CSPRNG TEST:');
    const results = { red: 0, black: 0, green: 0 };
    for (let i = 0; i < 100; i++) {
        const randomIndex = game.secureRandomInt(0, 38);
        const result = game.wheelNumbers[randomIndex];
        const color = game.getNumberColor(result);
        results[color]++;
    }
    console.log('   100 direct CSPRNG spins:');
    console.log(`   Red: ${results.red}, Black: ${results.black}, Green: ${results.green}`);
    
    // Test 4: Game spin test
    console.log('\n5. GAME SPIN TEST:');
    const gameResults = { red: 0, black: 0, green: 0 };
    const spinDetails = [];
    
    for (let i = 0; i < 50; i++) {
        const testGame = new RouletteGame(`test${i}`, 1000);
        testGame.placeBet('red', 1000);
        const result = testGame.spin();
        const color = testGame.getNumberColor(result);
        gameResults[color]++;
        
        if (i < 20) { // Log first 20 for analysis
            spinDetails.push(`${result} (${color})`);
        }
    }
    
    console.log('   50 game spins:');
    console.log(`   Red: ${gameResults.red}, Black: ${gameResults.black}, Green: ${gameResults.green}`);
    console.log('\n   First 20 results:', spinDetails.join(', '));
    
    // Test 5: Check for streak breaking interference
    console.log('\n6. STREAK BREAKING ANALYSIS:');
    
    // Force some greens to trigger streak breaking
    for (let i = 0; i < 5; i++) {
        const streakGame = new RouletteGame(`streak${i}`, 1000);
        streakGame.placeBet('red', 1000);
        
        // Manually set up some greens in the tracker
        const { RouletteGame: GameClass } = require('./GAMES/roulette');
        
        const result = streakGame.spin();
        const color = streakGame.getNumberColor(result);
        console.log(`   Spin ${i + 1}: ${result} (${color})`);
    }
    
    // Analysis
    console.log('\n7. ISSUE ANALYSIS:');
    
    const redPercent = (gameResults.red / 50) * 100;
    console.log(`   Red frequency in test: ${redPercent}%`);
    console.log(`   Expected red frequency: ~47%`);
    
    if (redPercent < 20) {
        console.log('   ❌ CRITICAL: Red frequency is extremely low!');
        console.log('   🔍 Investigating potential causes...');
        
        // Check if red numbers are being filtered out
        const redInWheel = game.wheelNumbers.filter(n => 
            typeof n === 'number' && game.redNumbers.includes(n)
        );
        console.log(`   Red numbers in wheel: ${redInWheel.length} (${redInWheel})`);
        
        // Check wheel structure
        console.log(`   Wheel structure check:`);
        console.log(`   - Contains 0: ${game.wheelNumbers.includes(0)}`);
        console.log(`   - Contains '00': ${game.wheelNumbers.includes('00')}`);
        console.log(`   - Contains red 1: ${game.wheelNumbers.includes(1)}`);
        console.log(`   - Contains red 3: ${game.wheelNumbers.includes(3)}`);
        
    } else {
        console.log('   ✅ Red frequency appears normal in this test');
        console.log('   🤔 Issue might be intermittent or user-specific');
    }
}

debugRedBias().catch(console.error);