# Bulletproof Economy V2 - Complete Documentation

## 🎯 Design Goals

**PRIMARY OBJECTIVE**: Make 1B+ wealth impossible, 1T absolutely unreachable

This economy system implements multiple mathematical layers of protection:

1. **Fixed Supply Cap** - Hard limit on total currency (100M default)
2. **Exponential Issuance Decay** - New currency issuance decreases over time
3. **Progressive Wealth Tax** - Taxes increase super-linearly with wealth
4. **Continuous Balance Decay** - Idle money slowly decays
5. **Diminishing Returns** - Rewards decrease as wealth increases
6. **Progressive Transaction Fees** - Large transfers cost more
7. **Anti-Farming Systems** - Cooldowns, caps, and repetition penalties
8. **Anti-Collusion Detection** - Detects coordinated exploitation

## 📦 System Architecture

```
EconomyCore (Main Controller)
├── SupplyController (Supply cap + minting control)
├── TaxationSystem (Progressive tax + decay)
├── RewardController (Diminishing returns + anti-farming)
├── TransactionManager (Progressive fees + validation)
└── AntiCollusionDetector (Pattern detection + freezing)
```

## 🚀 Quick Start

### 1. Initialize the System

```javascript
const EconomyCore = require('./BULLETPROOF_ECONOMY/v2/EconomyCore');
const database = require('./UTILS/database');
const logger = require('./UTILS/logger');

// Create economy instance
const economy = new EconomyCore(database, logger);

// Initialize (call once on bot startup)
await economy.initialize();
```

### 2. Issue Rewards

```javascript
// Issue a work reward
const result = await economy.issueReward(userId, 'WORK');

if (result.success) {
    console.log(`Rewarded ${result.amount} coins (${result.multiplier}x multiplier)`);
    console.log(`Reduced by ${result.reductionAmount} due to wealth/farming`);
} else {
    console.log(`Failed: ${result.reason}`);
}
```

### 3. Process Transfers

```javascript
// Transfer money between users
const result = await economy.processTransfer(senderId, recipientId, amount);

if (result.success) {
    console.log(`Transferred ${result.amount} coins`);
    console.log(`Fee: ${result.fee} (${result.feePercentage}%)`);
    console.log(`Collusion score: ${result.collusionCheck.score}`);
} else {
    console.log(`Transfer blocked: ${result.errors.join(', ')}`);
}
```

### 4. Preview Calculations

```javascript
// Calculate reward without issuing it
const rewardCalc = await economy.calculateReward(userId, 'DAILY');
console.log(`Would receive: ${rewardCalc.finalReward} coins`);
console.log(`Multiplier: ${rewardCalc.multiplier}x`);

// Calculate transaction fee
const feeCalc = economy.calculateTransactionFee(10000);
console.log(`Fee for 10K transfer: ${feeCalc.fee} (${feeCalc.percentage}%)`);

// Calculate user's tax
const taxCalc = await economy.calculateUserTax(userId);
console.log(`Next tax: ${taxCalc.taxAmount} at ${taxCalc.taxRate} rate`);
```

### 5. Check System Health

```javascript
// Get comprehensive statistics
const stats = economy.getEconomyStats();
console.log('Supply:', stats.supply);
console.log('Taxation:', stats.taxation);
console.log('Collusion:', stats.collusion);

// Health check
const health = await economy.healthCheck();
if (health.overall === 'ERROR') {
    console.error('Economy system unhealthy!', health.errors);
}
```

## 📊 Mathematical Formulas

### 1. Supply Control

**Fixed Cap:**
```
S_total ≤ S_cap (100M default)
```

**Exponential Decay Issuance:**
```
ΔS(t) = S_0 * e^(-λt)
where:
  S_0 = initial issuance rate (1000)
  λ = decay constant (0.05 = 5% daily)
  t = time in days
```

### 2. Progressive Wealth Tax

**Formula:**
```
tax_rate(w) = t0 + t1 * (w / Wm)^p
where:
  t0 = base rate (1%)
  t1 = progressive multiplier (15%)
  w = user wealth
  Wm = reference balance (50K)
  p = wealth exponent (1.8)

Maximum: 25%
```

**Bracket System:**
- <10K: 1%
- 10K-50K: 2%
- 50K-100K: 5%
- 100K-500K: 10%
- 500K+: 20%

### 3. Continuous Decay

**Exponential Decay:**
```
balance(t + Δt) = balance(t) * e^(-δ * Δt)
where:
  δ = daily decay rate (0.002 = 0.2%)
  Δt = time elapsed
```

Applied hourly to balances >10K

### 4. Diminishing Returns on Rewards

**Balance-Based:**
```
reward = base_reward * 1 / (1 + α * (balance / B))
where:
  α = dampening factor (2.5)
  B = reference balance (25K)
```

**Power-Law:**
```
reward = base_reward * (balance + 1)^(-γ)
where:
  γ = power exponent (0.3)
```

**Task Repetition:**
```
reward(n) = base * 1 / log(1 + n * c)
where:
  n = repetitions today
  c = log constant (0.5)
```

### 5. Transaction Fees

**Progressive Formula:**
```
fee = max(f_min, f_pct * amount + f_scale * amount^β)
where:
  f_min = minimum fee (10 coins)
  f_pct = base percentage (1.5%)
  f_scale = scaling factor (0.0000001)
  β = scaling exponent (1.2)

Maximum: 15% of transaction
```

**Large Transfer Penalty:**
- Transfers >50K: additional 5% fee

### 6. Anti-Farming

**Cooldown Scaling:**
```
cooldown = base_cooldown * (1 + β * streak)
where:
  β = streak multiplier (0.1 = 10% per streak)
```

**Daily Caps:**
```
cap_daily = BASE + level * PER_LEVEL
cap_daily ≤ ABSOLUTE_MAX (50K)
```

### 7. Anti-Collusion Scoring

**Collusion Score:**
```
score = w1 * transfer_count + w2 * time_gap^-1 + w3 * circular_transfers
where:
  w1 = 0.3 (transfer count weight)
  w2 = 0.3 (time gap inverse weight)
  w3 = 0.4 (circular transfer weight)

Thresholds:
  <50: Normal
  50-75: Suspicious (flag)
  75-90: Warning
  90+: Auto-freeze
```

## 🔧 Configuration

All parameters are defined in `config.js`:

### Key Parameters

```javascript
// Supply
ABSOLUTE_CAP: 100000000  // 100M total supply
INITIAL_ISSUANCE_RATE: 1000
ISSUANCE_DECAY_LAMBDA: 0.05  // 5% daily decay

// Taxation
BASE_RATE: 0.01  // 1%
MAX_TAX_RATE: 0.25  // 25%
DAILY_DECAY_RATE: 0.002  // 0.2%

// Rewards
DAMPENING_ALPHA: 2.5
POWER_LAW_GAMMA: 0.3

// Hard Limits
MAX_USER_BALANCE: 500000  // 500K max per user
MAX_DAILY_EARNINGS: 50000
MAX_TRANSACTION: 100000
```

## 🛡️ Security Features

### 1. Account Freezing

Accounts are automatically frozen when:
- Collusion score ≥ 90
- Circular transfer patterns detected
- Zero-sum coordination detected
- Rapid transfer patterns detected

### 2. Rate Limiting

- Maximum 20 transfers per hour
- Maximum 50 games per hour
- Maximum 100 commands per hour

### 3. Validation Checks

Every operation validates:
- Balance sufficiency
- Transaction limits
- Cooldown status
- Account frozen status
- Supply cap compliance

### 4. Logging & Auditing

All economic events are logged:
- Supply mints and burns
- Tax collections
- Large transfers
- Collusion detections
- Account freezes

## 📈 Monitoring & Administration

### Get System Stats

```javascript
const stats = economy.getEconomyStats();
console.log(JSON.stringify(stats, null, 2));
```

Output:
```json
{
  "system": {
    "version": "2.0.0",
    "uptime": 3600000,
    "operations": 12345
  },
  "supply": {
    "currentSupply": 5000000,
    "supplyCap": 100000000,
    "utilizationPercent": 5.0,
    "totalMinted": 6000000,
    "totalBurned": 1000000,
    "emergencyMode": false
  },
  "taxation": {
    "totalTaxesCollected": 50000,
    "totalDecayApplied": 10000
  },
  "transactions": {
    "totalFeesCollected": 25000,
    "transactionCount": 500
  },
  "collusion": {
    "suspiciousAccounts": 5,
    "frozenAccounts": 2
  }
}
```

### Manual Operations (Admin Only)

```javascript
// Run taxation cycle manually
await economy.runTaxationCycle();

// Run decay cycle manually
await economy.runDecayCycle();

// Emergency burn (use with caution!)
await economy.emergencyBurn(100000, 'Manual correction');

// Forecast supply
const forecast = economy.forecastSupply(30);  // 30 days ahead
console.log(`Projected supply in 30 days: ${forecast.projectedSupply}`);
```

### Health Monitoring

```javascript
// Check supply health
const health = economy.getSupplyHealth();
if (!health.healthy) {
    console.warn('Supply unhealthy!', health.warnings);
}

// Full health check
const fullHealth = await economy.healthCheck();
if (fullHealth.overall !== 'HEALTHY') {
    console.error('System issues detected:', fullHealth);
}
```

## 🎮 Integration Examples

### Work Command Integration

```javascript
// In your work command
const economy = require('./economy-instance');

async function executeWorkCommand(interaction) {
    const userId = interaction.user.id;

    // Issue work reward
    const result = await economy.issueReward(userId, 'WORK');

    if (result.success) {
        await interaction.reply(
            `✅ You worked and earned **${result.amount}** coins!\n` +
            `Multiplier: ${(result.multiplier * 100).toFixed(1)}%\n` +
            `${result.reduced ? `(Reduced from ${result.baseAmount} due to wealth/farming)` : ''}`
        );
    } else {
        await interaction.reply(
            `❌ ${result.reason}\n` +
            `${result.cooldown ? `Cooldown: ${result.cooldownFormatted}` : ''}`
        );
    }
}
```

### Transfer/Give Command Integration

```javascript
async function executeGiveCommand(interaction, recipientId, amount) {
    const senderId = interaction.user.id;

    // Process transfer
    const result = await economy.processTransfer(senderId, recipientId, amount, 'give');

    if (result.success) {
        await interaction.reply(
            `✅ Transferred **${result.amount}** coins to <@${recipientId}>!\n` +
            `Fee: ${result.fee} coins (${result.feePercentage.toFixed(2)}%)\n` +
            `Net transferred: ${result.netTransferred} coins\n` +
            `${result.collusionCheck.suspicious ? '⚠️ Transfer flagged for review' : ''}`
        );
    } else {
        await interaction.reply(
            `❌ Transfer failed:\n${result.errors.join('\n')}`
        );
    }
}
```

### Balance Command Integration

```javascript
async function executeBalanceCommand(interaction) {
    const userId = interaction.user.id;

    // Get user economy profile
    const profile = await economy.getUserEconomyProfile(userId);

    const embed = {
        title: `💰 Your Economy Profile`,
        fields: [
            {
                name: 'Balance',
                value: `Wallet: ${profile.balance.wallet}\nBank: ${profile.balance.bank}\n**Total: ${profile.balance.total}**`
            },
            {
                name: 'Taxation',
                value: `Next tax: ${profile.taxation.nextTaxAmount} (${(profile.taxation.taxRate * 100).toFixed(2)}%)\nBracket: ${profile.taxation.bracket.min}-${profile.taxation.bracket.max}`
            },
            {
                name: 'Status',
                value: `${profile.security.frozen ? '🔒 FROZEN' : '✅ Active'}\n${profile.security.suspicious ? '⚠️ Flagged' : '✔️ Clean'}`
            }
        ]
    };

    await interaction.reply({ embeds: [embed] });
}
```

## 🧪 Testing

### Unit Tests

Create test file `tests/test-economy-v2.js`:

```javascript
const EconomyCore = require('../BULLETPROOF_ECONOMY/v2/EconomyCore');
const database = require('../UTILS/database');
const logger = require('../UTILS/logger');

async function runTests() {
    const economy = new EconomyCore(database, logger);
    await economy.initialize();

    console.log('Testing reward issuance...');
    const reward = await economy.issueReward('test_user_1', 'WORK');
    console.assert(reward.success, 'Reward should succeed');
    console.assert(reward.amount > 0, 'Reward amount should be positive');

    console.log('Testing transaction fees...');
    const fee = economy.calculateTransactionFee(10000);
    console.assert(fee.fee > 0, 'Fee should be positive');
    console.assert(fee.fee < 10000, 'Fee should be less than amount');

    console.log('Testing supply cap...');
    const stats = economy.getEconomyStats();
    console.assert(stats.supply.currentSupply <= stats.supply.supplyCap, 'Supply should not exceed cap');

    console.log('✅ All tests passed!');
}

runTests().catch(console.error);
```

### Simulation Test

Test with simulated users:

```javascript
async function simulateEconomy(days, users) {
    const economy = new EconomyCore(database, logger);
    await economy.initialize();

    console.log(`Simulating ${days} days with ${users} users...`);

    for (let day = 0; day < days; day++) {
        // Simulate daily activities
        for (let i = 0; i < users; i++) {
            const userId = `sim_user_${i}`;

            // Work
            await economy.issueReward(userId, 'WORK');

            // Daily
            if (Math.random() < 0.5) {
                await economy.issueReward(userId, 'DAILY');
            }

            // Transfer
            if (Math.random() < 0.1) {
                const recipientId = `sim_user_${Math.floor(Math.random() * users)}`;
                await economy.processTransfer(userId, recipientId, 1000);
            }
        }

        // Daily cycles
        await economy.runTaxationCycle();
        await economy.runDecayCycle();

        // Log progress
        if (day % 10 === 0) {
            const stats = economy.getEconomyStats();
            console.log(`Day ${day}: Supply=${stats.supply.currentSupply}, Util=${stats.supply.utilizationPercent}%`);
        }
    }

    // Final stats
    const finalStats = economy.getEconomyStats();
    console.log('Simulation complete!');
    console.log(JSON.stringify(finalStats, null, 2));
}

simulateEconomy(180, 100).catch(console.error);  // 180 days, 100 users
```

## 🚨 Common Issues & Troubleshooting

### Issue: "Economy system not initialized"

**Solution:** Call `await economy.initialize()` once on bot startup

### Issue: Rewards seem too low

**Reason:** This is intentional! Rich users get heavily reduced rewards due to diminishing returns

**Check:** Use `economy.calculateReward(userId, taskType)` to see multipliers

### Issue: Transfers fail with high collusion score

**Reason:** Anti-collusion system detected suspicious patterns

**Solution:** Review transfer history with `transactionManager.getTransfersBetween(user1, user2)`

### Issue: Supply approaching cap

**Action:**
1. Check `economy.getSupplyHealth()`
2. Run emergency taxation: `await economy.runTaxationCycle()`
3. If critical: `await economy.emergencyBurn(amount, reason)`

## 📝 Best Practices

1. **Initialize Once** - Call `initialize()` only once on bot startup
2. **Use Preview Methods** - Use `calculateReward()` and `calculateTransactionFee()` to show users what they'll get before committing
3. **Monitor Supply** - Check `getSupplyHealth()` regularly
4. **Review Frozen Accounts** - Periodically check `collusionStats` for frozen accounts
5. **Log Everything** - The system logs extensively - use these logs for debugging
6. **Test Thoroughly** - Run simulations before deploying to production

## 🔐 Security Recommendations

1. **Protect Admin Functions** - `emergencyBurn()`, `runTaxationCycle()` should be admin-only
2. **Monitor Logs** - Watch for collusion warnings
3. **Regular Backups** - Backup economy data regularly
4. **Audit Trail** - Keep all transaction logs for at least 90 days
5. **Rate Limiting** - Enforce rate limits at Discord command level too

## 📚 Additional Resources

- `config.js` - All tunable parameters
- `EconomyCore.js` - Main API
- Mathematical formulas - See comments in each controller file
- Database schema - See `database-schema.sql` (if created)

## ✅ System Verification Checklist

Before going live:

- [ ] Initialize economy system successfully
- [ ] Issue test rewards and verify diminishing returns
- [ ] Test transfers and verify fees are applied
- [ ] Verify supply cap is enforced
- [ ] Test taxation cycle
- [ ] Test decay cycle
- [ ] Verify anti-collusion detection works
- [ ] Run health check
- [ ] Run 30-day simulation
- [ ] Review all configuration parameters
- [ ] Set up monitoring/alerts for supply warnings
- [ ] Backup strategy in place
- [ ] Admin commands properly protected

---

**Version:** 2.0.0
**Last Updated:** 2025-01-13
**Author:** Claude (Anthropic)
**License:** Proprietary - ATIVE Casino Bot

For support or questions, refer to the inline documentation in each module.
