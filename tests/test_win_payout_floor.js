// Simple runtime check: winning payouts are never net-negative
// This test exercises BulletproofEconomyController.adjustPostGamePayout directly

const BulletproofEconomyController = require('../BULLETPROOF_ECONOMY/BulletproofEconomyController');

async function run() {
  const ctrl = new BulletproofEconomyController();

  // Minimal stubs so adjustPostGamePayout proceeds through its logic
  ctrl.riskManager = {
    async getPlayerRiskAssessment(userId) {
      return {
        userId,
        riskLevel: 0.9, // high risk to force reductions pre-flooring
        riskCategory: 'high',
        historicalWinRate: 0.8,
        recentGameCount: 20,
        advantagePlayScore: 0.2,
      };
    }
  };
  ctrl.houseEdgeSystem = {
    calculateDynamicEdge(gameType, userId, betAmount, profile) {
      return 0.06; // 6% edge to exercise enforcement logic
    }
  };
  ctrl.trendAnalyzer = { getTrendAdjustment() { return 0; } };

  const cases = [
    { name: 'Close win, small margin', gameType: 'slots', bet: 1000, payout: 1100, won: true },
    { name: 'Bigger win', gameType: 'blackjack', bet: 5000, payout: 7500, won: true },
    { name: 'Loss unchanged', gameType: 'plinko', bet: 3000, payout: 0, won: false },
    { name: 'Edge case: payout equals bet', gameType: 'roulette', bet: 2000, payout: 2000, won: true },
  ];

  console.log('--- Payout Floor Verification ---');
  for (const c of cases) {
    const res = await ctrl.adjustPostGamePayout({
      gameType: c.gameType,
      userId: 'user_test',
      guildId: 'guild_test',
      betAmount: c.bet,
      originalPayout: c.payout,
      won: c.won,
      choice: 'N/A',
    });
    const ok = c.won ? (res.adjustedPayout >= c.bet) : (res.adjustedPayout === c.payout);
    console.log(`${c.name}: adjusted=${res.adjustedPayout}, bet=${c.bet}, original=${c.payout} -> ${ok ? 'OK' : 'FAIL'}`);
  }
}

run().catch(e => {
  console.error('Test failed with error:', e);
  process.exit(1);
});

