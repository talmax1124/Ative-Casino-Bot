/**
 * GAME INTEGRATION TESTING SCRIPT
 * Tests actual game commands to verify win rate adjustments are applied
 */

const { exec } = require('child_process');
const util = require('util');
const execAsync = util.promisify(exec);

async function testGameIntegration() {
    console.log('🎮 TESTING GAME INTEGRATION WITH WIN RATES\n');
    
    // Test different games to see if they use the balance-based adjustments
    const gamesToTest = ['flip', 'slots', 'blackjack', 'plinko', 'roulette'];
    
    for (const game of gamesToTest) {
        console.log(`Testing ${game.toUpperCase()} command...`);
        
        try {
            // Check if the game file uses UniversalGameIntegrator or balance-based adjustments
            const { stdout: grepResult } = await execAsync(
                `grep -l "UniversalGameIntegrator\\|balanceBasedAdjuster\\|generateGameOutcome\\|calculatePayout" COMMANDS/${game}.js || echo "Not found"`
            );
            
            if (grepResult.includes('Not found')) {
                console.log(`  ❌ ${game} does NOT use balance-based win rate adjustments`);
                
                // Check what system it uses
                const { stdout: systemCheck } = await execAsync(
                    `grep -n "payout\\|win\\|result" COMMANDS/${game}.js | head -5 || echo "No patterns found"`
                );
                console.log(`  📝 Current system: ${systemCheck.split('\n')[0] || 'Unknown'}`);
            } else {
                console.log(`  ✅ ${game} USES balance-based win rate adjustments`);
                
                // Check which methods it uses
                const { stdout: methodCheck } = await execAsync(
                    `grep -n "generateGameOutcome\\|calculatePayout\\|getBalanceAdjustments" COMMANDS/${game}.js || echo "No methods found"`
                );
                const methods = methodCheck.split('\n').filter(line => line.trim()).slice(0, 3);
                console.log(`  🔧 Methods used: ${methods.join(', ')}`);
            }
        } catch (error) {
            console.log(`  ⚠️ ${game} file not found or error: ${error.message}`);
        }
        
        console.log('');
    }
    
    // Check GAMES folder too
    console.log('\n🎯 Checking GAMES folder for integration...');
    
    for (const game of gamesToTest) {
        try {
            const { stdout: grepResult } = await execAsync(
                `grep -l "UniversalGameIntegrator\\|balanceBasedAdjuster" GAMES/${game}.js || echo "Not found"`
            );
            
            if (grepResult.includes('Not found')) {
                console.log(`  ❌ GAMES/${game} does NOT use balance-based adjustments`);
            } else {
                console.log(`  ✅ GAMES/${game} USES balance-based adjustments`);
            }
        } catch (error) {
            console.log(`  ⚠️ GAMES/${game} not found`);
        }
    }
    
    // Check if games are calling the right methods
    console.log('\n🔍 Checking method usage in game files...');
    
    try {
        const { stdout: universalUsage } = await execAsync(
            `find COMMANDS GAMES -name "*.js" -exec grep -l "UniversalGameIntegrator" {} \\; | wc -l`
        );
        console.log(`  📊 ${universalUsage.trim()} files use UniversalGameIntegrator`);
        
        const { stdout: balanceUsage } = await execAsync(
            `find COMMANDS GAMES -name "*.js" -exec grep -l "balanceBasedAdjuster" {} \\; | wc -l`
        );
        console.log(`  📊 ${balanceUsage.trim()} files use balanceBasedAdjuster directly`);
        
        const { stdout: generateOutcome } = await execAsync(
            `find COMMANDS GAMES -name "*.js" -exec grep -l "generateGameOutcome" {} \\; | wc -l`
        );
        console.log(`  📊 ${generateOutcome.trim()} files use generateGameOutcome method`);
        
        const { stdout: calculatePayout } = await execAsync(
            `find COMMANDS GAMES -name "*.js" -exec grep -l "calculatePayout" {} \\; | wc -l`
        );
        console.log(`  📊 ${calculatePayout.trim()} files use calculatePayout method`);
        
    } catch (error) {
        console.log(`  ⚠️ Error checking method usage: ${error.message}`);
    }
    
    console.log('\n✅ GAME INTEGRATION TEST COMPLETED');
}

if (require.main === module) {
    testGameIntegration().catch(error => {
        console.error('❌ Integration test failed:', error);
        process.exit(1);
    });
}

module.exports = testGameIntegration;