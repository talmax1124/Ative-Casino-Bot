# Economy Analyzer & Optimizer

**PRODUCTION-READY** Discord.js casino bot economy optimization system that follows strict safety protocols.

## 🚨 DO-NOT-CROSS RULES (NON-NEGOTIABLE)

- **NEVER** reset balances, NEVER wipe users, NEVER alter historical data
- Only apply **small, incremental tuning patches** (max ±1% per run)
- All data sourced from **MariaDB only** - writes limited to `tuning` and `regulator_log` tables
- ChatGPT use follows **strict advisor protocol** (max 1 call per 24h, ≤1.5KB payload)

## 🎯 System Overview

This system implements the exact specifications for a casino economy analyzer that:

1. **Calculates KPIs** from MariaDB (money supply, RTPs, Gini index, etc.)
2. **Diagnoses risks** (RTP out of bounds, inflation, wealth concentration)
3. **Generates tiny patches** (±1% payout adjustments, ±0.5% win odds)
4. **Safety checks** all changes to prevent economic damage
5. **Applies best patch** automatically with full audit trail
6. **Detects abuse** and applies user-specific caps

## 📊 KPIs Monitored (24h windows)

- **moneySupply**: Total user balances (wallet + bank)
- **overallRTP**: Total payouts / total stakes across all games  
- **perGameRTP**: Individual game Return-To-Player percentages
- **supplyGrowthPct**: Day-over-day money supply change
- **giniIndex**: Wealth inequality coefficient (0-1 scale)
- **activeUsers**: Users who bet in last 24h
- **abuseSignals**: Users with >3σ PnL or abnormal win rates

## 🎮 Policy Bands (Enforced Automatically)

```javascript
// Game-specific RTP targets
- Slots RTP:     0.92 – 0.96 (92-96%)
- Roulette RTP:  0.94 – 0.97 (94-97%) 
- Blackjack RTP: 0.98 – 1.02 (98-102%)
- Overall RTP:   0.85 – 1.05 (85-105%)

// Economic health targets  
- Supply growth: ~5%/day target
- Gini index:    ≤0.72 maximum inequality
```

## ⚙️ Tuning System

The system writes tiny adjustments to the `tuning` table:

```sql
-- Example tuning entries
INSERT INTO tuning VALUES ('slots', 'payoutMultDelta', -0.01);  -- Reduce slots payout 1%
INSERT INTO tuning VALUES ('global', 'feePctDelta', 0.25);      -- Increase fees 0.25%
INSERT INTO tuning VALUES ('cap:123456', 'maxBet', 5000);       -- Cap user bet limit
```

### Tuning Scopes
- `global` - System-wide adjustments (fees, bonuses, limits)
- `{gameName}` - Game-specific adjustments (payouts, odds)  
- `cap:{userId}` - Individual user limits for abuse prevention

## 🤖 ChatGPT Advisor Protocol

**STRICT USAGE LIMITS:**
- Maximum **once per 24 hours**
- Payload size **≤1.5KB** (aggregated data only)
- Uses **gpt-4o-mini** model with structured JSON output
- **Temperature 0.3**, max 300 tokens
- Only for tie-breaking between safe candidate patches

**What gets sent to ChatGPT:**
```json
{
  "moneySupply": 123456789,
  "overallRTP": 0.945,
  "perGame": {"slots": {"stakes": 1000000, "payouts": 920000, "rtp": 0.92}},
  "supplyGrowthPct": 7.2,
  "giniIndex": 0.68,
  "activeUsers": 1247,
  "candidates": [{"action": "reduce_payout_mult", "patch": {...}, "reason": "..."}]
}
```

**ChatGPT response format:**
```json
{
  "choice": "apply" | "noop",
  "chosenPatch": {"action": "...", "patch": {...}, "reason": "..."},
  "notes": "Brief explanation ≤80 words"
}
```

## 🚀 Installation & Setup

### 1. Database Requirements

The system requires these MariaDB tables (auto-created):

```sql
-- Core data tables (read-only for analyzer)
user_balances (user_id, wallet, bank, ...)
transactions (user_id, game, type, amount, ts, ...)
game_stats_daily (day, game, stakes, payouts, spins, unique_players)

-- Tuning system tables (write access)
tuning (scope, key_name, value, updated_at)
regulator_log (id, ts, action, payload)
```

### 2. Environment Variables

Add to your `.env`:

```bash
# Required - OpenAI API key for advisor
OPENAI_API_KEY=sk-...

# Optional - Discord notification channels
ECONOMY_REPORT_CHANNEL=1234567890123456789
ECONOMY_LOG_CHANNEL=1234567890123456789
```

### 3. Bot Integration

The system is already integrated in `index.js`. It initializes automatically when the bot starts.

## 📱 Discord Commands

Use `/economyanalyzer` with these subcommands:

- `status` - View system status and schedule
- `analyze` - Force immediate analysis (manual trigger)
- `history` - View recent patches and actions
- `tuning` - Show current tuning values  
- `start` - Start scheduled analysis
- `stop` - Stop scheduled analysis
- `emergency` - Emergency stop (disables automation)

## 🔄 Automated Operation

**Default Schedule:** Every 4 hours in production mode

**Analysis Flow:**
1. Calculate KPIs from database
2. Diagnose economic risks  
3. Generate 1-3 candidate patches
4. Safety check all candidates
5. Select best patch (using ChatGPT if ambiguous)
6. Apply patch and log to audit trail
7. Detect and cap abusive users

## 📋 Sample Analysis Output

```json
{
  "analysis": "Economy healthy: RTP 94.2%, supply growth 3.8%/day, 1,247 active users.",
  "suggestions": [
    {
      "action": "adjust_slots_payout", 
      "patch": {"scope": "slots", "key": "payoutMultDelta", "value": -0.005},
      "reason": "Reduce slots payout to optimize house edge"
    }
  ],
  "abuseFlags": [
    {
      "userId": "123456789",
      "reason": "PnL +45.2k / 24h, winrate 87%", 
      "suggestedCap": {"maxBet": 2000}
    }
  ]
}
```

## 🛡️ Safety Features

### Multi-Layer Protection:
1. **Step Limits**: Max ±1% payout, ±0.5% odds per run
2. **Policy Bands**: RTP must stay within game-specific ranges
3. **Simulation**: Patches tested against projected outcomes
4. **Audit Trail**: Every action logged with timestamp and reasoning
5. **Emergency Stop**: Manual and automatic emergency protections

### Abuse Detection:
- Statistical analysis (3-sigma outliers)
- Win rate anomaly detection (>70% sustained)
- Velocity analysis for unusual betting patterns
- Automatic bet caps for flagged users

## 🧪 Testing

Test the system manually:

```bash
node test-economy-analyzer.js
```

This validates:
- Database connectivity and schema
- KPI calculation accuracy
- Risk diagnosis logic
- Patch generation and safety checks
- Full optimization cycle

## 📊 Production Monitoring

**Key Metrics to Monitor:**
- Analysis success rate
- Patch application frequency
- User complaints about game balance
- Overall economic stability trends
- ChatGPT API costs and usage

**Alerts to Set Up:**
- Emergency mode activation
- Repeated patch failures
- Extreme KPI values (supply growth >20%/day)
- High volume of abuse flags

## ⚠️ Troubleshooting

**Common Issues:**

1. **"No patches generated"** - Normal if economy is stable
2. **"All patches failed safety checks"** - KPIs may be too extreme
3. **"ChatGPT advisor failed"** - Check API key and quota
4. **"Database connection failed"** - Verify MariaDB credentials

**Emergency Recovery:**
```sql
-- View recent changes
SELECT * FROM regulator_log ORDER BY ts DESC LIMIT 10;

-- Reset specific tuning (if needed)
DELETE FROM tuning WHERE scope = 'slots' AND key_name = 'payoutMultDelta';
```

## 🔐 Security Notes

- **No PII sent to ChatGPT** - Only aggregated metrics
- **Read-only access** to user data tables
- **Write-limited** to tuning and audit tables only
- **Rate limited** ChatGPT calls (1 per 24h max)
- **Audit trail** for all economic changes

---

**Economy Analyzer & Optimizer** - Autonomous casino economy management with production-grade safety and reliability.

For support, check the audit logs first, then contact your development team with specific error messages and system state information.