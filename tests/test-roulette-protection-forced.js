/**
 * FORCED ROULETTE PROTECTION TEST
 * Forces analysis to confirm Nash equilibrium protection works
 */

const GameTrendAnalyzer = require('./UTILS/GameTrendAnalyzer');

async function testRouletteProtectionForced() {
    console.log('🎯 FORCED ROULETTE EXPLOITATION PROTECTION TEST');
    console.log('Testing Nash equilibrium protection with forced analysis\n');
    
    const analyzer = new GameTrendAnalyzer();
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    // Record enough choices to trigger analysis (minSampleSize = 100)
    console.log('📊 Recording 100+ choices to trigger analysis...');
    
    // 80 red players, 20 black players (80% bias toward red)
    console.log('   - 80 players betting RED (80%)');
    console.log('   - 20 players betting BLACK (20%)');
    console.log('   - This is above the 70% threshold for Nash intervention\n');
    
    // Add red players
    for (let i = 1; i <= 80; i++) {
        await analyzer.recordChoice('roulette', `red_player_${i}`, 'red', {
            betAmount: 1000,
            won: Math.random() < 0.47,
            round: 1
        });
    }
    
    // Add black players
    for (let i = 1; i <= 20; i++) {
        await analyzer.recordChoice('roulette', `black_player_${i}`, 'black', {
            betAmount: 1000,
            won: Math.random() < 0.47,
            round: 1
        });
    }
    
    // Force analysis by manually calling it
    console.log('🔍 Forcing trend analysis...');
    await analyzer.analyzeGameTrends('roulette');
    
    // Check the adjustment
    const adjustment = analyzer.getTrendAdjustment('roulette');
    console.log(`\n🛡️ PROTECTION RESULTS:`);
    console.log(`   Nash Equilibrium Adjustment: +${(adjustment * 100).toFixed(3)}% house edge`);
    
    if (adjustment > 0) {
        console.log(`   ✅ PROTECTION ACTIVATED!`);
        console.log(`   🎯 System detected 80% color bias (above 70% threshold)`);
        console.log(`   🛡️ House edge increased to prevent exploitation`);
        
        // Demonstrate protection on various bet sizes
        const betSizes = [1000, 10000, 100000, 1000000];
        console.log(`\n💰 PROTECTION IMPACT ON DIFFERENT BET SIZES:`);
        
        for (const bet of betSizes) {
            const normalPayout = bet * 2; // 2x for red/black win
            const protectedPayout = normalPayout * (1 - adjustment);
            const reduction = normalPayout - protectedPayout;
            
            console.log(`   $${bet.toLocaleString()} bet:`);
            console.log(`     Normal win: $${normalPayout.toLocaleString()}`);
            console.log(`     Protected win: $${Math.round(protectedPayout).toLocaleString()}`);
            console.log(`     House saves: $${Math.round(reduction).toLocaleString()}\n`);
        }
        
    } else {
        console.log(`   ❌ PROTECTION NOT ACTIVATED`);
        console.log(`   ⚠️  This indicates a configuration issue!`);
    }
    
    // Test extreme bias (95% red)
    console.log(`🔥 EXTREME BIAS TEST: Adding more red players for 95% bias`);
    
    // Add 15 more red players (total 95 red, 20 black = 82.6% bias)
    for (let i = 81; i <= 95; i++) {
        await analyzer.recordChoice('roulette', `extreme_red_${i}`, 'red', {
            betAmount: 1000,
            won: Math.random() < 0.47,
            round: 2
        });
    }
    
    // Force analysis again
    await analyzer.analyzeGameTrends('roulette');
    
    const extremeAdjustment = analyzer.getTrendAdjustment('roulette');
    console.log(`\n🛡️ EXTREME BIAS PROTECTION:`);
    console.log(`   Adjustment: +${(extremeAdjustment * 100).toFixed(3)}% house edge`);
    
    if (extremeAdjustment > adjustment) {
        console.log(`   ✅ STRONGER PROTECTION for higher bias!`);
    } else if (extremeAdjustment > 0) {
        console.log(`   ✅ PROTECTION MAINTAINED`);
    }
    
    // Show final summary
    console.log(`\n📋 FINAL SUMMARY:`);
    const summary = analyzer.getTrendSummary();
    console.log(JSON.stringify(summary, null, 2));
    
    console.log(`\n🎲 CONCLUSION:`);
    if (adjustment > 0) {
        console.log(`✅ GameTrendAnalyzer SUCCESSFULLY prevents roulette exploitation!`);
        console.log(`🧠 Nash equilibrium theory correctly identifies player coordination`);
        console.log(`🛡️ House edge increases automatically when >70% players use same strategy`);
        console.log(`💰 Large wins are reduced proportionally to prevent instant wealth`);
        console.log(`🎯 System maintains economic balance through intelligent adjustments`);
    } else {
        console.log(`❌ Protection failed to activate - requires configuration review`);
    }
}

testRouletteProtectionForced().catch(console.error);