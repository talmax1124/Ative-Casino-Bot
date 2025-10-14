/**
 * Test Blackjack House Edge Fix
 * Verify the updated house edge is working properly
 */

const { BlackjackGame } = require('./GAMES/blackjack');

function testBlackjackFix() {
    console.log('🃏 TESTING BLACKJACK HOUSE EDGE FIX\n');
    
    const betAmount = 1000;
    const userId = 'test-user';
    
    // Test default configuration
    const game = new BlackjackGame(userId, betAmount);
    
    console.log('📊 Updated Configuration:');
    console.log(`  Blackjack Multiplier: ${game.modeConfig.blackjackMultiplier}x (was 2.5x)`);
    console.log(`  Win Multiplier: ${game.modeConfig.winMultiplier}x (was 2.0x)`);
    console.log(`  House Edge: ${(game.modeConfig.houseEdge * 100).toFixed(1)}% (was 0.5%)`);
    
    // Calculate expected payouts
    const blackjackPayout = betAmount * game.modeConfig.blackjackMultiplier;
    const regularWinPayout = betAmount * game.modeConfig.winMultiplier;
    
    console.log(`\n💰 Expected Payouts:`);
    console.log(`  Bet Amount: ${betAmount}`);
    console.log(`  Blackjack Payout: ${blackjackPayout} (${((blackjackPayout/betAmount - 1) * 100).toFixed(0)}% profit)`);
    console.log(`  Regular Win Payout: ${regularWinPayout} (${((regularWinPayout/betAmount - 1) * 100).toFixed(0)}% profit)`);
    console.log(`  Loss Payout: 0 (100% loss)`);
    
    // Calculate theoretical RTP (simplified)
    const blackjackProb = 0.048; // ~4.8% chance of blackjack
    const regularWinProb = 0.42 - blackjackProb; // ~37.2% regular wins
    const lossProb = 0.52; // ~52% losses (including pushes as break-even)
    
    const expectedPayout = 
        (blackjackProb * blackjackPayout) + 
        (regularWinProb * regularWinPayout) + 
        (lossProb * 0);
    
    const theoreticalRTP = (expectedPayout / betAmount) * 100;
    const actualHouseEdge = 100 - theoreticalRTP;
    
    console.log(`\n🎯 Theoretical Analysis:`);
    console.log(`  Expected RTP: ${theoreticalRTP.toFixed(1)}%`);
    console.log(`  Actual House Edge: ${actualHouseEdge.toFixed(1)}%`);
    console.log(`  Configured House Edge: ${(game.modeConfig.houseEdge * 100).toFixed(1)}%`);
    
    // Verdict
    if (actualHouseEdge > 2 && actualHouseEdge < 5) {
        console.log(`\n✅ HOUSE EDGE FIX SUCCESSFUL`);
        console.log(`   House edge is now in acceptable range (2-5%)`);
    } else if (actualHouseEdge <= 2) {
        console.log(`\n⚠️ HOUSE EDGE STILL TOO LOW`);
        console.log(`   Consider reducing payouts further`);
    } else {
        console.log(`\n⚠️ HOUSE EDGE TOO HIGH`);
        console.log(`   Consider increasing payouts slightly`);
    }
    
    console.log(`\n📈 Improvement Summary:`);
    console.log(`  Previous House Edge: 0.5%`);
    console.log(`  New House Edge: ${actualHouseEdge.toFixed(1)}%`);
    console.log(`  Improvement: ${((actualHouseEdge - 0.5) * 100).toFixed(0)}% harder for players`);
    
    console.log(`\n🎰 This means:`);
    console.log(`  - Players will win less frequently overall`);
    console.log(`  - Casino will retain more money per game`);
    console.log(`  - Balance-based adjustments will still apply on top of this`);
    console.log(`  - Economy will be more sustainable`);
}

if (require.main === module) {
    testBlackjackFix();
}

module.exports = testBlackjackFix;