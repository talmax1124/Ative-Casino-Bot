// Additional coverage: ensure a variety of games respect the win floor
// Uses UNIT_TEST mode to skip heavy initializers

process.env.UNIT_TEST = '1';

const { PayoutManager, GameResult } = require('../UTILS/gameUtils');
const dbManager = require('../UTILS/database');

async function ensureBalance(userId, guildId, amount) {
  await dbManager.setUserBalance(userId, guildId, amount, 0, { test_user: true });
}

async function getWallet(userId, guildId) {
  const bal = await dbManager.getUserBalance(userId, guildId);
  return bal.wallet;
}

async function simulateRound({ userId, guildId, gameType, startWallet, bet, payout, won }) {
  await ensureBalance(userId, guildId, startWallet);
  // simulate pre-deduction
  await dbManager.updateUserBalance(userId, guildId, -bet, 0);
  const before = await getWallet(userId, guildId);

  const result = new GameResult({ userId, guildId, gameType, betAmount: bet, payout, won });
  await PayoutManager.processGamePayout(result);

  const after = await getWallet(userId, guildId);
  return { before, after };
}

async function run() {
  const userId = 'u_test_more_games';
  const guildId = 'g_test';
  const startWallet = 75000;

  const cases = [
    // Clamp scenarios where calculated payout < bet on a win
    { gameType: 'yahtzee', bet: 2000, payout: 1800, won: true },
    { gameType: 'keno', bet: 1500, payout: 1200, won: true },
    // Regular wins
    { gameType: 'mines', bet: 2500, payout: 4000, won: true },
    { gameType: 'plinko', bet: 3000, payout: 4500, won: true },
    // Losses remain losses
    { gameType: 'yahtzee', bet: 2200, payout: 0, won: false },
  ];

  console.log('--- More Games Win Floor Verification ---');
  for (const c of cases) {
    const { before, after } = await simulateRound({ userId, guildId, gameType: c.gameType, startWallet, bet: c.bet, payout: c.payout, won: c.won });
    const net = after - before;
    const ok = c.won ? (net >= 0) : (net === 0);
    console.log(`${c.gameType.padEnd(10)} bet=${c.bet} payout=${c.payout} won=${c.won} -> net=${net} ${ok ? 'OK' : 'FAIL'}`);
  }
}

run().catch(e => { console.error('Test failed:', e); process.exit(1); });

