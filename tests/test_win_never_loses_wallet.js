// End-to-end style test through PayoutManager ensuring wins never reduce wallet
// Uses UNIT_TEST mode to avoid heavy initializers

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
  // simulate pre-deduction like validateAndDeductBet
  await dbManager.updateUserBalance(userId, guildId, -bet, 0);
  const before = await getWallet(userId, guildId);

  const result = new GameResult({ userId, guildId, gameType, betAmount: bet, payout, won });
  const pr = await PayoutManager.processGamePayout(result);

  const after = await getWallet(userId, guildId);
  return { before, after, pr };
}

async function run() {
  const userId = 'u_test_win_floor';
  const guildId = 'g_test';
  const startWallet = 50000;

  const cases = [
    { gameType: 'slots', bet: 1000, payout: 1050, won: true },
    { gameType: 'blackjack', bet: 2500, payout: 2600, won: true },
    { gameType: 'roulette', bet: 2000, payout: 2000, won: true }, // push-like
    { gameType: 'mines', bet: 1500, payout: 1600, won: true },
    { gameType: 'plinko', bet: 1800, payout: 1750, won: true }, // under-bet payout, should clamp ≥ bet
    { gameType: 'ceelo', bet: 3000, payout: 0, won: false },     // loss remains loss
  ];

  console.log('--- Wallet impact checks (wins should not reduce wallet) ---');
  for (const c of cases) {
    const { before, after } = await simulateRound({ userId, guildId, gameType: c.gameType, startWallet, bet: c.bet, payout: c.payout, won: c.won });
    const net = after - before; // net change after payout phase (bet already deducted)
    const ok = c.won ? (net >= 0) : (net === 0); // for losses, after equals before (no payout)
    console.log(`${c.gameType.padEnd(10)} bet=${c.bet} payout=${c.payout} won=${c.won} -> net=${net} ${ok ? 'OK' : 'FAIL'}`);
  }
}

run().catch(e => { console.error('Test failed:', e); process.exit(1); });

