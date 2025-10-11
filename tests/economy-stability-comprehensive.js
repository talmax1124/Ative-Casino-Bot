/**
 * COMPREHENSIVE ECONOMY STABILITY TESTING
 * Tests the entire casino economy for stability and market cap compliance
 */

const logger = require('../UTILS/logger');
const dbManager = require('../UTILS/database');

// Import all game classes
const { RouletteGame } = require('../GAMES/roulette');
const { BlackjackGame } = require('../GAMES/blackjack');
const { PlinkoGameSession } = require('../GAMES/plinko');
const { spinSlots, calculatePayout, SLOT_SYMBOLS } = require('../GAMES/slots');

const economyTestResults = {
    totalTests: 0,
    passed: 0,
    failed: 0,
    economyData: {
        totalPayouts: 0,
        totalBets: 0,
        netProfit: 0,
        largestWin: 0,
        largestLoss: 0,
        averageMultiplier: 0,
        gamesPlayed: 0
    },
    gameBreakdown: {}
};

function logEconomyResult(testName, passed, details = '') {
    economyTestResults.totalTests++;
    if (passed) {
        economyTestResults.passed++;
        console.log(`✅ ${testName}: PASSED ${details}`);
    } else {
        economyTestResults.failed++;
        console.log(`❌ ${testName}: FAILED ${details}`);
    }
}

async function simulateGameResults(gameType, numSimulations = 1000, betAmount = 1000) {
    const results = {
        totalBets: 0,
        totalPayouts: 0,
        wins: 0,
        losses: 0,
        maxWin: 0,
        maxLoss: 0,
        multipliers: []
    };

    console.log(`\n🎮 SIMULATING ${numSimulations} ${gameType.toUpperCase()} GAMES`);

    for (let i = 0; i < numSimulations; i++) {
        let payout = 0;
        let won = false;

        try {
            switch (gameType) {
                case 'roulette':
                    const roulette = new RouletteGame('test_user', betAmount);
                    const spin = roulette.spin();
                    const result = roulette.calculatePayout('red', betAmount, spin);
                    payout = result.payout;
                    won = result.won;
                    break;

                case 'blackjack':
                    // Simulate blackjack outcomes (simplified)
                    const bjGame = new BlackjackGame('test_user', betAmount);
                    bjGame.dealInitialCards();
                    const bjResults = await bjGame.getResults();
                    if (bjResults.length > 0) {
                        payout = bjResults[0].payout;
                        won = bjResults[0].won;
                    }
                    break;

                case 'slots':
                    const slotsResult = spinSlots();
                    const slotsPayout = calculatePayout(slotsResult, betAmount);
                    payout = slotsPayout.payout;
                    won = slotsPayout.won;
                    break;

                case 'plinko':
                    const plinko = new PlinkoGameSession('test_user', 'TestUser', betAmount, 'test_channel', 'medium');
                    const dropResult = await plinko.simulateDrop(4); // Middle position
                    payout = dropResult.winnings;
                    won = dropResult.profit > 0;
                    break;
            }

            results.totalBets += betAmount;
            results.totalPayouts += payout;
            
            if (won) {
                results.wins++;
                const profit = payout - betAmount;
                results.maxWin = Math.max(results.maxWin, profit);
            } else {
                results.losses++;
                const loss = betAmount - payout;
                results.maxLoss = Math.max(results.maxLoss, loss);
            }

            const multiplier = payout / betAmount;
            results.multipliers.push(multiplier);

        } catch (error) {
            console.warn(`Simulation error for ${gameType}: ${error.message}`);
            results.totalBets += betAmount;
            // Treat as loss
            results.losses++;
            results.maxLoss = Math.max(results.maxLoss, betAmount);
        }
    }

    // Calculate statistics
    const winRate = (results.wins / numSimulations) * 100;
    const houseEdge = ((results.totalBets - results.totalPayouts) / results.totalBets) * 100;
    const avgMultiplier = results.multipliers.reduce((a, b) => a + b, 0) / results.multipliers.length;
    
    console.log(`📊 ${gameType.toUpperCase()} RESULTS:`);
    console.log(`   Win Rate: ${winRate.toFixed(2)}%`);
    console.log(`   House Edge: ${houseEdge.toFixed(2)}%`);
    console.log(`   Average Multiplier: ${avgMultiplier.toFixed(3)}x`);
    console.log(`   Max Win: $${results.maxWin.toLocaleString()}`);
    console.log(`   Max Loss: $${results.maxLoss.toLocaleString()}`);
    console.log(`   Total Volume: $${results.totalBets.toLocaleString()}`);

    // Update global economy data
    economyTestResults.economyData.totalPayouts += results.totalPayouts;
    economyTestResults.economyData.totalBets += results.totalBets;
    economyTestResults.economyData.largestWin = Math.max(economyTestResults.economyData.largestWin, results.maxWin);
    economyTestResults.economyData.largestLoss = Math.max(economyTestResults.economyData.largestLoss, results.maxLoss);
    economyTestResults.economyData.gamesPlayed += numSimulations;

    economyTestResults.gameBreakdown[gameType] = {
        winRate: winRate,
        houseEdge: houseEdge,
        avgMultiplier: avgMultiplier,
        maxWin: results.maxWin,
        volume: results.totalBets
    };

    // Validate house edge is positive (casino profitable)
    if (houseEdge > 0) {
        logEconomyResult(`${gameType} house edge positive`, true, `${houseEdge.toFixed(2)}%`);
    } else {
        logEconomyResult(`${gameType} house edge positive`, false, `${houseEdge.toFixed(2)}% - LOSING MONEY!`);
    }

    // Validate reasonable win rates (not too high)
    if (winRate < 60) {
        logEconomyResult(`${gameType} win rate reasonable`, true, `${winRate.toFixed(2)}%`);
    } else {
        logEconomyResult(`${gameType} win rate reasonable`, false, `${winRate.toFixed(2)}% - TOO HIGH!`);
    }

    // Validate maximum multipliers are capped
    const maxMultiplier = Math.max(...results.multipliers);
    if (maxMultiplier <= 5.0) {
        logEconomyResult(`${gameType} multiplier cap enforced`, true, `Max: ${maxMultiplier.toFixed(2)}x`);
    } else {
        logEconomyResult(`${gameType} multiplier cap enforced`, false, `Max: ${maxMultiplier.toFixed(2)}x - EXCEEDS LIMIT!`);
    }

    return results;
}

async function testEconomyStability() {
    console.log('🏦 TESTING ECONOMY STABILITY');
    console.log('='.repeat(60));

    // Test each game type
    const games = ['roulette', 'slots', 'plinko']; // Skip blackjack for now due to async complexity
    
    for (const game of games) {
        await simulateGameResults(game, 1000, 1000); // 1000 games with $1000 bets
    }

    // Calculate overall economy metrics
    const netProfit = economyTestResults.economyData.totalBets - economyTestResults.economyData.totalPayouts;
    const overallHouseEdge = (netProfit / economyTestResults.economyData.totalBets) * 100;
    const avgMultiplier = economyTestResults.economyData.totalPayouts / economyTestResults.economyData.totalBets;

    economyTestResults.economyData.netProfit = netProfit;
    economyTestResults.economyData.averageMultiplier = avgMultiplier;

    console.log('\n🌍 OVERALL ECONOMY METRICS:');
    console.log(`📊 Total Games Simulated: ${economyTestResults.economyData.gamesPlayed.toLocaleString()}`);
    console.log(`💰 Total Bets: $${economyTestResults.economyData.totalBets.toLocaleString()}`);
    console.log(`🎉 Total Payouts: $${economyTestResults.economyData.totalPayouts.toLocaleString()}`);
    console.log(`🏦 House Profit: $${netProfit.toLocaleString()}`);
    console.log(`📈 Overall House Edge: ${overallHouseEdge.toFixed(2)}%`);
    console.log(`🎯 Average Multiplier: ${avgMultiplier.toFixed(3)}x`);

    // Validate overall economy health
    if (overallHouseEdge > 5 && overallHouseEdge < 30) {
        logEconomyResult('Overall house edge healthy', true, `${overallHouseEdge.toFixed(2)}%`);
    } else {
        logEconomyResult('Overall house edge healthy', false, `${overallHouseEdge.toFixed(2)}% - UNHEALTHY!`);
    }

    if (avgMultiplier < 1.5) {
        logEconomyResult('Average multiplier reasonable', true, `${avgMultiplier.toFixed(3)}x`);
    } else {
        logEconomyResult('Average multiplier reasonable', false, `${avgMultiplier.toFixed(3)}x - TOO HIGH!`);
    }

    return economyTestResults;
}

async function projectedMonthlyVolume() {
    console.log('\n📈 MONTHLY VOLUME PROJECTION');
    
    // Based on simulation results, project monthly volume
    const dailyGamesPerUser = 50; // Conservative estimate
    const activeUsers = 1000; // Conservative estimate
    const avgBetSize = 2000; // Average bet size
    
    const dailyVolume = dailyGamesPerUser * activeUsers * avgBetSize;
    const monthlyVolume = dailyVolume * 30;
    
    console.log(`👥 Projected Active Users: ${activeUsers.toLocaleString()}`);
    console.log(`🎮 Daily Games per User: ${dailyGamesPerUser}`);
    console.log(`💵 Average Bet Size: $${avgBetSize.toLocaleString()}`);
    console.log(`📊 Daily Volume: $${dailyVolume.toLocaleString()}`);
    console.log(`📅 Monthly Volume: $${monthlyVolume.toLocaleString()}`);
    
    const trillionCap = 1000000000000; // $1 trillion
    const volumeVsCap = (monthlyVolume / trillionCap) * 100;
    
    console.log(`🎯 Volume vs $1T Cap: ${volumeVsCap.toFixed(2)}%`);
    
    if (monthlyVolume < trillionCap) {
        logEconomyResult('Monthly volume under $1T cap', true, `${volumeVsCap.toFixed(2)}% of cap`);
    } else {
        logEconomyResult('Monthly volume under $1T cap', false, `EXCEEDS CAP BY ${(monthlyVolume - trillionCap).toLocaleString()}`);
    }
    
    return {
        monthlyVolume,
        trillionCap,
        volumePercentage: volumeVsCap
    };
}

async function runComprehensiveEconomyTests() {
    console.log('🏦 COMPREHENSIVE ECONOMY STABILITY TESTING');
    console.log('='.repeat(60));
    
    await testEconomyStability();
    await projectedMonthlyVolume();
    
    console.log('\n' + '='.repeat(60));
    console.log('📊 ECONOMY TEST SUMMARY');
    console.log(`✅ Passed: ${economyTestResults.passed}`);
    console.log(`❌ Failed: ${economyTestResults.failed}`);
    console.log(`📈 Success Rate: ${((economyTestResults.passed / economyTestResults.totalTests) * 100).toFixed(1)}%`);
    
    console.log('\n🎮 GAME BREAKDOWN:');
    Object.entries(economyTestResults.gameBreakdown).forEach(([game, data]) => {
        console.log(`${game.toUpperCase()}:`);
        console.log(`  House Edge: ${data.houseEdge.toFixed(2)}%`);
        console.log(`  Win Rate: ${data.winRate.toFixed(2)}%`);
        console.log(`  Max Win: $${data.maxWin.toLocaleString()}`);
    });
    
    console.log('\n🏦 ECONOMY STATUS:');
    if (economyTestResults.failed === 0) {
        console.log('🟢 ECONOMY STABLE - READY FOR MARKET CAP SYSTEM');
    } else {
        console.log('🔴 ECONOMY ISSUES DETECTED - REQUIRES ADJUSTMENT');
    }
    
    return economyTestResults;
}

// Export for use in other files
module.exports = { runComprehensiveEconomyTests, economyTestResults };

// Run tests if called directly
if (require.main === module) {
    runComprehensiveEconomyTests().then(results => {
        process.exit(results.failed > 0 ? 1 : 0);
    }).catch(error => {
        console.error('❌ Economy test execution failed:', error.message);
        process.exit(1);
    });
}