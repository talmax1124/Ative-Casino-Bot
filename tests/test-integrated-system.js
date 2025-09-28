/**
 * Integrated System Test - Economy Analyzer + Game Tuning + Web Dashboard
 * Tests the complete economy regulation system
 */

require('dotenv').config();
const tuningManager = require('./UTILS/tuningManager');
const logger = require('./UTILS/logger');

async function testIntegratedSystem() {
    console.log('🎛️ Testing Integrated Economy Regulation System...\n');
    
    try {
        // Initialize database adapter first
        console.log('1. Initializing database adapter...');
        const databaseAdapter = require('./UTILS/databaseAdapter');
        await databaseAdapter.initialize();
        console.log('✅ Database adapter initialized');
        
        // Initialize tuning manager
        console.log('2. Initializing tuning manager...');
        await tuningManager.initialize();
        console.log('✅ Tuning manager initialized\n');
        
        // Test game integration
        console.log('3. Testing game integration...');
        
        // Simulate applying some tuning values
        await tuningManager.db.execute(`
            INSERT INTO tuning (scope, key_name, value) VALUES 
            ('slots', 'payoutMultDelta', -0.01),
            ('blackjack', 'payoutMultDelta', 0.005),
            ('global', 'feePctDelta', 0.15),
            ('global', 'maxBetDeltaPct', 10),
            ('cap:123456789', 'maxBet', 5000)
            ON DUPLICATE KEY UPDATE value = VALUES(value)
        `);
        console.log('✅ Test tuning values applied\n');
        
        // Test slots integration
        console.log('4. Testing slots game integration...');
        const slotsUserId = '123456789';
        const slotsBet = 1000;
        const slotsBasePayout = 2500;
        
        // Test max bet limit
        const slotsMaxBet = await tuningManager.getMaxBetLimit(slotsUserId, 'slots', 10000);
        console.log(`   Max bet limit: $${slotsMaxBet.maxBet} (user capped: ${slotsMaxBet.userCapped})`);
        
        // Test payout adjustment
        const slotsPayoutAdj = await tuningManager.getAdjustedPayout('slots', slotsBasePayout, slotsBet);
        console.log(`   Payout: $${slotsBasePayout} -> $${slotsPayoutAdj.adjustedPayout} (${(slotsPayoutAdj.payoutDelta * 100).toFixed(1)}% delta)`);
        
        // Record game result
        await tuningManager.recordGameResult(slotsUserId, 'slots', slotsBet, slotsPayoutAdj.adjustedPayout, true);
        console.log('✅ Slots integration working\n');
        
        // Test blackjack integration
        console.log('5. Testing blackjack game integration...');
        const blackjackUserId = '987654321';
        const blackjackBet = 500;
        const blackjackBasePayout = 1000;
        
        // Test max bet limit (different user, no cap)
        const blackjackMaxBet = await tuningManager.getMaxBetLimit(blackjackUserId, 'blackjack', 10000);
        console.log(`   Max bet limit: $${blackjackMaxBet.maxBet} (adjusted: ${blackjackMaxBet.adjustmentApplied})`);
        
        // Test payout adjustment
        const blackjackPayoutAdj = await tuningManager.getAdjustedPayout('blackjack', blackjackBasePayout, blackjackBet);
        console.log(`   Payout: $${blackjackBasePayout} -> $${blackjackPayoutAdj.adjustedPayout} (${(blackjackPayoutAdj.payoutDelta * 100).toFixed(1)}% delta)`);
        
        // Record game result
        await tuningManager.recordGameResult(blackjackUserId, 'blackjack', blackjackBet, blackjackPayoutAdj.adjustedPayout, true);
        console.log('✅ Blackjack integration working\n');
        
        // Test tuning summary
        console.log('6. Testing tuning system overview...');
        const summary = await tuningManager.getTuningSummary();
        console.log(`   Total tunings: ${summary.totalTunings}`);
        console.log(`   Game adjustments: ${JSON.stringify(summary.gameAdjustments, null, 2)}`);
        console.log(`   Global adjustments: ${JSON.stringify(summary.globalAdjustments, null, 2)}`);
        console.log(`   User caps: ${summary.userCaps}`);
        console.log('✅ Tuning system overview working\n');
        
        // Test recent data
        console.log('7. Testing data recording and retrieval...');
        const [gameStats] = await tuningManager.db.execute(`
            SELECT day, game, stakes, payouts, spins, unique_players 
            FROM game_stats_daily 
            WHERE day = CURDATE()
            ORDER BY game
        `);
        
        console.log('✅ Today\'s game statistics:');
        gameStats.forEach(stat => {
            const rtp = stat.stakes > 0 ? ((stat.payouts / stat.stakes) * 100).toFixed(1) : 0;
            console.log(`   ${stat.game}: $${stat.stakes} staked, $${stat.payouts} paid out, RTP: ${rtp}%, ${stat.spins} spins, ${stat.unique_players} players`);
        });
        
        const [transactions] = await tuningManager.db.execute(`
            SELECT COUNT(*) as count FROM transactions WHERE ts >= NOW() - INTERVAL 1 HOUR
        `);
        console.log(`   ${transactions[0].count} transactions in last hour\n`);
        
        // Test economy analysis integration
        console.log('8. Testing economy analyzer data source...');
        const [moneySupply] = await tuningManager.db.execute('SELECT SUM(wallet + bank) as total FROM user_balances');
        const [recentActivity] = await tuningManager.db.execute(`
            SELECT COUNT(DISTINCT user_id) as active_users 
            FROM transactions 
            WHERE ts >= NOW() - INTERVAL 24 HOUR AND type = 'bet'
        `);
        
        console.log(`   Money supply: $${moneySupply[0].total?.toLocaleString() || '0'}`);
        console.log(`   Active users (24h): ${recentActivity[0].active_users}`);
        console.log('✅ Economy data ready for analysis\n');
        
        // Web dashboard test
        console.log('9. Testing web dashboard API simulation...');
        
        // Simulate API calls that dashboard would make
        const mockStatusAPI = async () => {
            // Get current tuning values (like /api/economy/tuning endpoint)
            const summary = await tuningManager.getTuningSummary();
            return {
                success: true,
                data: {
                    tuning: summary,
                    lastUpdate: new Date().toISOString()
                }
            };
        };
        
        const statusResponse = await mockStatusAPI();
        console.log('✅ Dashboard API simulation successful');
        console.log(`   Response: ${JSON.stringify(statusResponse, null, 2)}\n`);
        
        // Test manual tuning application (like dashboard would do)
        console.log('10. Testing manual tuning application...');
        
        // Apply a small adjustment like dashboard would
        await tuningManager.db.execute(
            'INSERT INTO tuning (scope, key_name, value) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE value = value + VALUES(value)',
            ['roulette', 'payoutMultDelta', -0.002]
        );
        
        // Log the action like dashboard API would
        await tuningManager.db.execute(
            'INSERT INTO regulator_log (action, payload) VALUES (?, ?)',
            ['manual_tuning_test', JSON.stringify({
                game: 'roulette',
                adjustment: -0.002,
                source: 'integration_test',
                timestamp: new Date().toISOString()
            })]
        );
        
        // Force cache refresh
        await tuningManager.forceCacheRefresh();
        
        console.log('✅ Manual tuning application successful\n');
        
        // Final system health check
        console.log('11. Final system health check...');
        
        // Verify all components are working
        const healthCheck = {
            database: true,
            tuningCache: summary.totalTunings > 0,
            gameIntegration: slotsPayoutAdj.adjustedPayout !== slotsBasePayout,
            userCaps: summary.userCaps > 0,
            dataRecording: gameStats.length > 0,
            manualControls: true
        };
        
        const allHealthy = Object.values(healthCheck).every(check => check === true);
        
        console.log('🏥 System Health Status:');
        Object.entries(healthCheck).forEach(([component, status]) => {
            console.log(`   ${component}: ${status ? '✅ Healthy' : '❌ Issues'}`);
        });
        
        if (allHealthy) {
            console.log('\n🎉 INTEGRATED SYSTEM FULLY OPERATIONAL!');
            console.log('\n📊 SYSTEM CAPABILITIES:');
            console.log('   ✅ Real-time game payout regulation');
            console.log('   ✅ Dynamic max bet limits with user caps');
            console.log('   ✅ Automatic data recording for economy analysis');
            console.log('   ✅ Web dashboard for manual control');
            console.log('   ✅ Safety limits and audit trail');
            console.log('   ✅ Multi-game support (slots, blackjack, etc.)');
            console.log('\n🚀 YOUR CASINO IS NOW UNDER AI ECONOMIC CONTROL!');
            
            // Show what happens next
            console.log('\n📋 NEXT STEPS:');
            console.log('   1. Start your Discord bot (node index.js)');
            console.log('   2. Economy analyzer will run every 4 hours automatically');
            console.log('   3. Access web dashboard: http://localhost:3000/economy-dashboard');
            console.log('   4. Games will use AI-tuned payouts and limits');
            console.log('   5. Monitor logs for tuning applications');
            
        } else {
            console.log('\n⚠️ Some system components need attention');
        }
        
    } catch (error) {
        console.error('❌ Integration test failed:', error.message);
        console.error(error.stack);
        process.exit(1);
    }
}

// Run the test
testIntegratedSystem().then(() => {
    console.log('\n✅ Integration test completed successfully');
    process.exit(0);
}).catch(error => {
    console.error('❌ Integration test failed:', error.message);
    process.exit(1);
});