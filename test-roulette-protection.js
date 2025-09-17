/**
 * ROULETTE EXPLOITATION PROTECTION TEST
 * Confirms that GameTrendAnalyzer prevents large roulette wins through Nash equilibrium
 */

const GameTrendAnalyzer = require('./UTILS/GameTrendAnalyzer');

async function testRouletteProtection() {
    console.log('🎯 TESTING ROULETTE EXPLOITATION PROTECTION');
    console.log('Scenario: Large group of players all betting RED to exploit the system\n');
    
    const analyzer = new GameTrendAnalyzer();
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    // Simulate 50 players - 40 betting red (80%), 10 betting black (20%)
    console.log('📊 Simulating 50 players: 40 betting RED (80%), 10 betting BLACK (20%)');
    console.log('This should trigger Nash equilibrium protection...\n');
    
    // Create 40 red players
    for (let i = 1; i <= 40; i++) {
        await analyzer.recordChoice('roulette', `red_player_${i}`, 'red', {
            betAmount: 1000,
            won: Math.random() < 0.47,
            round: 1
        });
    }
    
    // Create 10 black players  
    for (let i = 1; i <= 10; i++) {
        await analyzer.recordChoice('roulette', `black_player_${i}`, 'black', {
            betAmount: 1000,
            won: Math.random() < 0.47,
            round: 1
        });
    }
    
    // Check the adjustment
    const adjustment = analyzer.getTrendAdjustment('roulette');
    console.log(`🛡️ PROTECTION STATUS:`);
    console.log(`   Nash Equilibrium Adjustment: +${(adjustment * 100).toFixed(3)}% house edge`);
    
    if (adjustment > 0) {
        console.log(`   ✅ PROTECTION ACTIVE - System detected color bias exploitation!`);
        console.log(`   🎯 House edge increased to prevent large wins on RED`);
        
        // Show what this means for a large bet
        const largeBet = 100000;
        const normalPayout = largeBet * 2; // 2x for red/black win
        const protectedPayout = normalPayout * (1 - adjustment);
        const reduction = normalPayout - protectedPayout;
        
        console.log(`\n💰 LARGE BET PROTECTION EXAMPLE:`);
        console.log(`   Bet Amount: $${largeBet.toLocaleString()}`);
        console.log(`   Normal Payout: $${normalPayout.toLocaleString()}`);
        console.log(`   Protected Payout: $${Math.round(protectedPayout).toLocaleString()}`);
        console.log(`   Reduction: $${Math.round(reduction).toLocaleString()} (${(adjustment * 100).toFixed(1)}%)`);
        
    } else {
        console.log(`   ❌ PROTECTION NOT TRIGGERED`);
        console.log(`   ⚠️  Players could potentially exploit the system!`);
    }
    
    // Test with even more extreme bias
    console.log(`\n🔥 EXTREME TEST: 95% players betting RED`);
    
    // Add 45 more red players (total 85 red, 10 black = 89.5% red bias)
    for (let i = 41; i <= 85; i++) {
        await analyzer.recordChoice('roulette', `extreme_red_${i}`, 'red', {
            betAmount: 1000,
            won: Math.random() < 0.47,
            round: 2
        });
    }
    
    const extremeAdjustment = analyzer.getTrendAdjustment('roulette');
    console.log(`🛡️ EXTREME PROTECTION STATUS:`);
    console.log(`   Nash Equilibrium Adjustment: +${(extremeAdjustment * 100).toFixed(3)}% house edge`);
    
    if (extremeAdjustment > 0) {
        console.log(`   ✅ MAXIMUM PROTECTION ACTIVE!`);
        
        const megaBet = 1000000; // $1M bet
        const normalMegaPayout = megaBet * 2;
        const protectedMegaPayout = normalMegaPayout * (1 - extremeAdjustment);
        const megaReduction = normalMegaPayout - protectedMegaPayout;
        
        console.log(`\n💎 MEGA BET PROTECTION:`);
        console.log(`   Bet: $${megaBet.toLocaleString()}`);
        console.log(`   Normal Payout: $${normalMegaPayout.toLocaleString()}`);
        console.log(`   Protected Payout: $${Math.round(protectedMegaPayout).toLocaleString()}`);
        console.log(`   House Saves: $${Math.round(megaReduction).toLocaleString()}`);
    }
    
    // Get comprehensive summary
    console.log(`\n📋 COMPREHENSIVE PROTECTION SUMMARY:`);
    const summary = analyzer.getTrendSummary();
    
    if (summary.activeAdjustments && summary.activeAdjustments.roulette) {
        const rouletteProtection = summary.activeAdjustments.roulette;
        console.log(`✅ ROULETTE PROTECTION: ${rouletteProtection.houseEdgeIncrease}`);
        console.log(`🎯 REASON: ${rouletteProtection.reason}`);
        console.log(`🔒 STATUS: Preventing exploitation of color bias`);
    } else {
        console.log(`❌ NO ACTIVE PROTECTION`);
    }
    
    console.log(`\n🎲 CONCLUSION:`);
    if (extremeAdjustment > 0) {
        console.log(`✅ GameTrendAnalyzer SUCCESSFULLY prevents roulette exploitation!`);
        console.log(`🛡️ Nash equilibrium adjustments protect against coordinated betting`);
        console.log(`💰 Large wins are automatically reduced when bias is detected`);
    } else {
        console.log(`❌ Protection may need adjustment - check configuration`);
    }
}

testRouletteProtection().catch(console.error);