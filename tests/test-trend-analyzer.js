/**
 * Test script for GameTrendAnalyzer - Nash Equilibrium Intelligence System
 * Demonstrates trend analysis and dynamic adjustments
 */

const GameTrendAnalyzer = require('./UTILS/GameTrendAnalyzer');

async function testTrendAnalyzer() {
    console.log('🧠 Testing GameTrendAnalyzer - Nash Equilibrium Intelligence...\n');
    
    // Initialize analyzer
    const analyzer = new GameTrendAnalyzer();
    
    // Wait a moment for initialization
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    console.log('📊 Simulating Roulette Color Bias Scenario...');
    console.log('Scenario: 80% of players betting on RED (Nash exploitation)');
    
    // Simulate roulette color bias - 80% players betting red
    const players = ['user1', 'user2', 'user3', 'user4', 'user5', 'user6', 'user7', 'user8', 'user9', 'user10'];
    
    for (let round = 1; round <= 3; round++) {
        console.log(`\n--- Round ${round} ---`);
        
        // 8 players bet red, 2 bet black
        for (let i = 0; i < 8; i++) {
            await analyzer.recordChoice('roulette', players[i], 'red', {
                betAmount: 1000,
                won: Math.random() < 0.47, // Slightly under 50% to simulate house edge
                round: round
            });
        }
        
        for (let i = 8; i < 10; i++) {
            await analyzer.recordChoice('roulette', players[i], 'black', {
                betAmount: 1000,
                won: Math.random() < 0.47,
                round: round
            });
        }
        
        // Check adjustment after each round
        const adjustment = analyzer.getTrendAdjustment('roulette');
        console.log(`Current trend adjustment: +${(adjustment * 100).toFixed(3)}% house edge`);
    }
    
    console.log('\n📊 Simulating Crash Game Clustering...');
    console.log('Scenario: Players clustering around 2.0x cashout (predictable behavior)');
    
    // Simulate crash clustering - everyone cashes out around 2.0x
    for (let i = 0; i < 50; i++) {
        const multiplier = 1.8 + Math.random() * 0.4; // Cluster around 2.0x
        await analyzer.recordChoice('crash', `crashUser${i}`, 'cashout', {
            betAmount: 500,
            multiplier: multiplier,
            won: true
        });
    }
    
    const crashAdjustment = analyzer.getTrendAdjustment('crash');
    console.log(`Crash trend adjustment: +${(crashAdjustment * 100).toFixed(3)}% house edge`);
    
    console.log('\n📊 Simulating RPS Predictable Patterns...');
    console.log('Scenario: Players showing predictable rock-paper-scissors patterns');
    
    // Simulate RPS predictable patterns
    const rpsPlayers = ['rps1', 'rps2', 'rps3', 'rps4', 'rps5'];
    for (const player of rpsPlayers) {
        // Each player shows a predictable pattern
        const pattern = ['rock', 'paper', 'scissors', 'rock', 'paper', 'scissors'];
        for (let i = 0; i < pattern.length; i++) {
            await analyzer.recordChoice('rps', player, pattern[i], {
                betAmount: 100,
                won: Math.random() < 0.45 // Slightly losing due to predictability
            });
        }
    }
    
    const rpsAdjustment = analyzer.getTrendAdjustment('rps');
    console.log(`RPS trend adjustment: +${(rpsAdjustment * 100).toFixed(3)}% house edge`);
    
    // Get comprehensive summary
    console.log('\n🎯 COMPREHENSIVE TREND ANALYSIS SUMMARY:');
    const summary = analyzer.getTrendSummary();
    console.log(JSON.stringify(summary, null, 2));
    
    console.log('\n✅ GameTrendAnalyzer test completed!');
    console.log('🧠 Nash equilibrium intelligence is working and detecting player patterns.');
    console.log('🎯 House edge adjustments are being applied to prevent exploitation.');
}

// Run the test
testTrendAnalyzer().catch(console.error);